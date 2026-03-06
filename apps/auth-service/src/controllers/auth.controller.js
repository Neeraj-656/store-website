/**
 * auth.controller.js
 *
 * Route handlers. Thin delegation to auth.service.js.
 * Responsible only for: extracting request data, calling service, shaping response.
 */

import * as authService from '../services/auth.service.js';
import logger from '../utils/logger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getIp(req) {
  // Honour X-Forwarded-For when behind a proxy / API gateway
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ??
    req.socket?.remoteAddress ??
    'unknown'
  );
}

function getUA(req) {
  return req.headers['user-agent'] ?? null;
}

// ─── A. Registration ──────────────────────────────────────────────────────────

export async function registerCustomer(req, res, next) {
  try {
    const result = await authService.registerCustomer(req.body, { ipAddress: getIp(req) });
    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      data:    result.user,
      // Only present in non-production for e2e testing without email
      ...(result.devOtp && { devOtp: result.devOtp }),
    });
  } catch (err) { next(err); }
}

export async function registerVendor(req, res, next) {
  try {
    const result = await authService.registerVendor(req.body, { ipAddress: getIp(req) });
    return res.status(201).json({
      success: true,
      message: 'Vendor registration successful. Please verify your email.',
      data:    result.user,
      ...(result.devOtp && { devOtp: result.devOtp }),
    });
  } catch (err) { next(err); }
}

export async function registerAdmin(req, res, next) {
  try {
    const result = await authService.registerAdmin(req.body);
    return res.status(201).json({
      success: true,
      message: 'Admin account created.',
      data:    result.user,
    });
  } catch (err) { next(err); }
}

// ─── B. Login ─────────────────────────────────────────────────────────────────

export async function login(req, res, next) {
  try {
    const result = await authService.login(req.body, {
      ipAddress: getIp(req),
      userAgent: getUA(req),
    });

    logger.info({
      msg:    'Login successful',
      userId: result.user.id,
      role:   result.user.role,
      ip:     getIp(req),
      requestId: req.requestId,
    });

    return res.json({
      success:      true,
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt:    result.expiresAt,
      user:         result.user,
    });
  } catch (err) { next(err); }
}

// ─── C. Token Refresh ─────────────────────────────────────────────────────────

export async function refresh(req, res, next) {
  try {
    const result = await authService.refreshTokens(req.body.refreshToken, {
      ipAddress: getIp(req),
      userAgent: getUA(req),
    });
    return res.json({
      success:      true,
      accessToken:  result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt:    result.expiresAt,
    });
  } catch (err) { next(err); }
}

// ─── D. Logout ────────────────────────────────────────────────────────────────

export async function logout(req, res, next) {
  try {
    await authService.logout({
      accessToken:  req.accessToken,
      refreshToken: req.body.refreshToken,
      userId:       req.user.id,
    });
    return res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) { next(err); }
}

export async function logoutAll(req, res, next) {
  try {
    await authService.logoutAll({
      accessToken: req.accessToken,
      userId:      req.user.id,
    });
    return res.json({ success: true, message: 'All sessions terminated.' });
  } catch (err) { next(err); }
}

// ─── E. Me ────────────────────────────────────────────────────────────────────

export async function getMe(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id);
    return res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

// ─── F. Email Verification ────────────────────────────────────────────────────

export async function verifyEmail(req, res, next) {
  try {
    await authService.verifyEmail(req.user.id, req.body.otp);
    return res.json({ success: true, message: 'Email verified successfully.' });
  } catch (err) { next(err); }
}

export async function resendEmailVerification(req, res, next) {
  try {
    const result = await authService.resendEmailVerification(req.user.id);
    return res.json({
      success: true,
      message: 'Verification email sent.',
      ...(result?.devOtp && { devOtp: result.devOtp }),
    });
  } catch (err) { next(err); }
}

// ─── G. Phone Verification ────────────────────────────────────────────────────

export async function sendPhoneOtp(req, res, next) {
  try {
    const result = await authService.sendPhoneOtp(req.user.id, req.body.phone);
    return res.json({
      success: true,
      message: 'OTP sent to phone.',
      ...(result?.devOtp && { devOtp: result.devOtp }),
    });
  } catch (err) { next(err); }
}

export async function verifyPhone(req, res, next) {
  try {
    await authService.verifyPhone(req.user.id, req.body.phone, req.body.otp);
    return res.json({ success: true, message: 'Phone number verified.' });
  } catch (err) { next(err); }
}

// ─── H. Password Reset ────────────────────────────────────────────────────────

export async function forgotPassword(req, res, next) {
  try {
    const result = await authService.forgotPassword(req.body.email);
    // Always return 200 — never reveal whether the email exists
    return res.json({
      success: true,
      message: 'If an account with that email exists, a reset code has been sent.',
      ...(result?.devOtp && { devOtp: result.devOtp }),
    });
  } catch (err) { next(err); }
}

export async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.body);
    return res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (err) { next(err); }
}

// ─── I. Change Password (authenticated) ──────────────────────────────────────

export async function changePassword(req, res, next) {
  try {
    await authService.changePassword(req.user.id, req.body, {
      accessToken: req.accessToken,
    });
    return res.json({
      success: true,
      message: 'Password changed. All sessions have been terminated.',
    });
  } catch (err) { next(err); }
}

// ─── J. Internal endpoints (consumed by Admin / other services) ───────────────

export async function suspendAccount(req, res, next) {
  try {
    await authService.suspendAccount(req.params.userId, req.body.reason);
    return res.json({ success: true, message: 'Account suspended.' });
  } catch (err) { next(err); }
}

export async function unsuspendAccount(req, res, next) {
  try {
    await authService.unsuspendAccount(req.params.userId);
    return res.json({ success: true, message: 'Account unsuspended.' });
  } catch (err) { next(err); }
}

// ─── K. Public key endpoint (for other services to fetch the JWT public key) ──

export async function getPublicKey(_req, res) {
  const { default: config } = await import('../config/index.js');
  return res.json({ success: true, data: { publicKey: config.jwt.publicKey } });
}
