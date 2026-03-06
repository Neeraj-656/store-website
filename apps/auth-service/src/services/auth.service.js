/**
 * auth.service.js
 *
 * Core authentication domain logic.
 * Owns: signup, login, token refresh, logout, password reset, account state.
 *
 * Intentionally contains NO business logic — does not:
 *   - Create vendor profiles (published as event, Vendor Service handles it)
 *   - Create admin records (same)
 *   - Validate stock, handle payments, etc.
 */

import prisma   from '../../prisma/client.js';
import config   from '../config/index.js';
import logger   from '../utils/logger.js';
import { hashPassword, verifyPassword } from '../utils/crypto.utils.js';
import { issueAccessToken, getTokenExpiry } from './jwt.service.js';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  denylistAccessToken,
  isTokenDenylisted,
} from './token.service.js';
import { issueOtp, verifyOtpCode } from './otp.service.js';
import {
  AppError,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  AccountLockedError,
  ForbiddenError,
} from '../utils/errors.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function enqueueEvent(tx, userId, eventType, payload) {
  await tx.authOutboxEvent.create({ data: { userId, eventType, payload } });
}

async function recordLoginAttempt(tx, { userId, ipAddress, email, success, userAgent, failReason }) {
  await tx.loginAttempt.create({
    data: { userId, ipAddress, email, success, userAgent, failReason },
  });
}

// ─── A. Registration ─────────────────────────────────────────────────────────

export async function registerCustomer({ email, password, phone }, { ipAddress } = {}) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('An account with this email already exists');

  if (phone) {
    const phoneExists = await prisma.user.findUnique({ where: { phone } });
    if (phoneExists) throw new ConflictError('An account with this phone number already exists');
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        phone:        phone ?? null,
        passwordHash,
        role:         'customer',
        status:       'PENDING_VERIFICATION',
      },
    });

    await enqueueEvent(tx, u.id, 'customer.created', {
      userId:    u.id,
      email:     u.email,
      phone:     u.phone,
      createdAt: u.createdAt.toISOString(),
    });

    return u;
  });

  // Issue email verification OTP (non-fatal if fails)
  const devOtp = await issueOtp(user.id, 'EMAIL_VERIFICATION', email).catch((err) => {
    logger.error({ msg: 'Failed to issue email verification OTP', userId: user.id, err });
    return null;
  });

  logger.info({ msg: 'Customer registered', userId: user.id, email });
  return { user: sanitize(user), devOtp };
}

export async function registerVendor({ email, password, phone }, { ipAddress } = {}) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('An account with this email already exists');

  if (phone) {
    const phoneExists = await prisma.user.findUnique({ where: { phone } });
    if (phoneExists) throw new ConflictError('An account with this phone number already exists');
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        phone:        phone ?? null,
        passwordHash,
        role:         'vendor',
        status:       'PENDING_VERIFICATION',
      },
    });

    // Vendor Service consumes this event and creates the Vendor profile
    await enqueueEvent(tx, u.id, 'vendor.created', {
      userId:    u.id,
      email:     u.email,
      phone:     u.phone,
      createdAt: u.createdAt.toISOString(),
    });

    return u;
  });

  const devOtp = await issueOtp(user.id, 'EMAIL_VERIFICATION', email).catch(() => null);

  logger.info({ msg: 'Vendor registered', userId: user.id, email });
  return { user: sanitize(user), devOtp };
}

export async function registerAdmin({ email, password, phone }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ConflictError('An account with this email already exists');

  const passwordHash = await hashPassword(password);

  // Admins are created ACTIVE — the Admin Service is responsible for
  // creating their AdminUser record after consuming the admin.created event
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email,
        phone:           phone ?? null,
        passwordHash,
        role:            'admin',
        status:          'ACTIVE',
        isEmailVerified: true,
      },
    });

    await enqueueEvent(tx, u.id, 'admin.created', {
      userId:    u.id,
      email:     u.email,
      createdAt: u.createdAt.toISOString(),
    });

    return u;
  });

  logger.info({ msg: 'Admin registered', userId: user.id, email });
  return { user: sanitize(user) };
}

// ─── B. Login ────────────────────────────────────────────────────────────────

export async function login({ email, password }, { ipAddress, userAgent } = {}) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-time-ish path for non-existent emails (still runs password hash to mask timing)
  if (!user) {
    await _recordFailedAttempt(null, ipAddress, email, userAgent, 'NOT_FOUND');
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // ── Account state checks ────────────────────────────────────────────────
  if (user.status === 'DEACTIVATED') {
    throw new ForbiddenError('This account has been deactivated');
  }

  if (user.status === 'SUSPENDED') {
    throw new ForbiddenError('This account has been suspended. Please contact support.');
  }

  if (user.status === 'LOCKED') {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountLockedError(user.lockedUntil);
    }
    // Lock has expired — reset automatically
    await prisma.user.update({
      where: { id: user.id },
      data:  { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null },
    });
  }

  // ── Password verification ────────────────────────────────────────────────
  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    await _handleFailedLogin(user, ipAddress, email, userAgent);
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // ── Successful login ─────────────────────────────────────────────────────
  await prisma.user.update({
    where: { id: user.id },
    data:  {
      failedLoginCount: 0,
      lockedUntil:      null,
      lastLoginAt:      new Date(),
      lastLoginIp:      ipAddress ?? null,
    },
  });

  await _recordLoginAttemptDirect({ userId: user.id, ipAddress, email, success: true, userAgent });

  const { token: accessToken, jti, expiresAt: accessExpiresAt } = issueAccessToken(user);
  const { raw: refreshToken } = await issueRefreshToken(user.id, { ipAddress, userAgent });

  logger.info({ msg: 'User logged in', userId: user.id, role: user.role, ipAddress });

  return {
    accessToken,
    refreshToken,
    expiresAt: accessExpiresAt,
    user: sanitize(user),
  };
}

// ─── C. Token Refresh ────────────────────────────────────────────────────────

export async function refreshTokens(rawRefreshToken, { ipAddress, userAgent } = {}) {
  const { raw: newRefreshToken, userId } = await rotateRefreshToken(rawRefreshToken, {
    ipAddress, userAgent,
  });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError('User not found');

  if (['SUSPENDED', 'DEACTIVATED'].includes(user.status)) {
    // Revoke the newly issued token immediately
    await revokeRefreshToken(newRefreshToken);
    throw new ForbiddenError(`Account is ${user.status.toLowerCase()}`);
  }

  const { token: accessToken, expiresAt } = issueAccessToken(user);

  logger.debug({ msg: 'Tokens refreshed', userId, ipAddress });

  return { accessToken, refreshToken: newRefreshToken, expiresAt };
}

// ─── D. Logout ───────────────────────────────────────────────────────────────

export async function logout({ accessToken, refreshToken, userId }) {
  // Denylist the access token by jti so it's rejected until natural expiry
  if (accessToken) {
    const { verifyAccessToken } = await import('./jwt.service.js');
    const payload = verifyAccessToken(accessToken);
    if (payload?.jti) {
      const expiresAt = getTokenExpiry(accessToken) ?? new Date(Date.now() + 15 * 60 * 1000);
      await denylistAccessToken(payload.jti, userId, expiresAt);
    }
  }

  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  logger.info({ msg: 'User logged out', userId });
}

export async function logoutAll({ accessToken, userId }) {
  if (accessToken) {
    const { verifyAccessToken } = await import('./jwt.service.js');
    const payload = verifyAccessToken(accessToken);
    if (payload?.jti) {
      const expiresAt = getTokenExpiry(accessToken) ?? new Date(Date.now() + 15 * 60 * 1000);
      await denylistAccessToken(payload.jti, userId, expiresAt);
    }
  }

  await revokeAllRefreshTokens(userId);
  logger.info({ msg: 'All sessions revoked', userId });
}

// ─── E. Email Verification ────────────────────────────────────────────────────

export async function resendEmailVerification(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  if (user.isEmailVerified) throw new ConflictError('Email is already verified');

  const devOtp = await issueOtp(userId, 'EMAIL_VERIFICATION', user.email);
  return { devOtp };
}

export async function verifyEmail(userId, otp) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  if (user.isEmailVerified) throw new ConflictError('Email is already verified');

  await verifyOtpCode(userId, 'EMAIL_VERIFICATION', otp);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data:  {
        isEmailVerified: true,
        status: user.status === 'PENDING_VERIFICATION' ? 'ACTIVE' : user.status,
      },
    });

    await enqueueEvent(tx, userId, 'account.activated', {
      userId,
      email:       user.email,
      role:        user.role,
      activatedAt: new Date().toISOString(),
    });
  });

  logger.info({ msg: 'Email verified', userId });
}

// ─── F. Phone Verification ────────────────────────────────────────────────────

export async function sendPhoneOtp(userId, phone) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  // Ensure phone is not already taken
  const existing = await prisma.user.findFirst({
    where: { phone, id: { not: userId } },
  });
  if (existing) throw new ConflictError('This phone number is already in use');

  const devOtp = await issueOtp(userId, 'PHONE_VERIFICATION', phone);
  return { devOtp };
}

export async function verifyPhone(userId, phone, otp) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  await verifyOtpCode(userId, 'PHONE_VERIFICATION', otp);

  await prisma.user.update({
    where: { id: userId },
    data:  { phone, isPhoneVerified: true },
  });

  logger.info({ msg: 'Phone verified', userId, phone });
}

// ─── G. Password Reset ────────────────────────────────────────────────────────

export async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always return success — don't reveal whether the email exists
  if (!user || user.status === 'DEACTIVATED') return;

  const devOtp = await issueOtp(user.id, 'PASSWORD_RESET', email);
  return { devOtp };
}

export async function resetPassword({ email, otp, newPassword }) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid reset request', 'INVALID_CREDENTIALS');

  await verifyOtpCode(user.id, 'PASSWORD_RESET', otp);

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data:  { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
  });

  // Revoke all existing sessions after password reset
  await revokeAllRefreshTokens(user.id);

  logger.info({ msg: 'Password reset completed', userId: user.id });
}

// ─── H. Change Password (authenticated) ──────────────────────────────────────

export async function changePassword(userId, { currentPassword, newPassword }, { accessToken } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Current password is incorrect', 'WRONG_PASSWORD');

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data:  { passwordHash, passwordChangedAt: new Date() },
  });

  // Invalidate all sessions
  if (accessToken) {
    const { verifyAccessToken } = await import('./jwt.service.js');
    const payload = verifyAccessToken(accessToken);
    if (payload?.jti) {
      const expiresAt = getTokenExpiry(accessToken) ?? new Date(Date.now() + 15 * 60 * 1000);
      await denylistAccessToken(payload.jti, userId, expiresAt);
    }
  }
  await revokeAllRefreshTokens(userId);

  logger.info({ msg: 'Password changed, all sessions revoked', userId });
}

// ─── I. Get own profile ───────────────────────────────────────────────────────

export async function getMe(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');
  return sanitize(user);
}

// ─── Internal: suspension (consumed from admin.account_suspended event) ──────

export async function suspendAccount(userId, reason) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data:  { status: 'SUSPENDED' },
    });

    await enqueueEvent(tx, userId, 'account.suspended', {
      userId,
      email:       user.email,
      reason,
      suspendedAt: new Date().toISOString(),
    });
  });

  // Force all sessions to end
  await revokeAllRefreshTokens(userId);
  logger.info({ msg: 'Account suspended', userId, reason });
}

export async function unsuspendAccount(userId) {
  await prisma.user.update({
    where: { id: userId },
    data:  { status: 'ACTIVE' },
  });
  logger.info({ msg: 'Account unsuspended', userId });
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function sanitize(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

async function _handleFailedLogin(user, ipAddress, email, userAgent) {
  const newCount = user.failedLoginCount + 1;
  const willLock = newCount >= config.security.maxFailedLogins;

  const lockedUntil = willLock
    ? new Date(Date.now() + config.security.lockoutDurationMin * 60 * 1000)
    : null;

  await prisma.user.update({
    where: { id: user.id },
    data:  {
      failedLoginCount: newCount,
      lockedUntil,
      status: willLock ? 'LOCKED' : user.status,
    },
  });

  await _recordFailedAttempt(user.id, ipAddress, email, userAgent,
    willLock ? 'ACCOUNT_LOCKED' : 'BAD_PASSWORD');

  logger.warn({ msg: 'Failed login', userId: user.id, count: newCount, willLock, ipAddress });
}

async function _recordFailedAttempt(userId, ipAddress, email, userAgent, failReason) {
  await prisma.loginAttempt.create({
    data: {
      userId:    userId ?? null,
      ipAddress: ipAddress ?? 'unknown',
      email,
      success:   false,
      userAgent: userAgent ?? null,
      failReason,
    },
  });
}

async function _recordLoginAttemptDirect({ userId, ipAddress, email, success, userAgent }) {
  await prisma.loginAttempt.create({
    data: {
      userId:    userId ?? null,
      ipAddress: ipAddress ?? 'unknown',
      email,
      success,
      userAgent: userAgent ?? null,
    },
  });
}
