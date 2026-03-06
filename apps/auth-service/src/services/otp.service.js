/**
 * otp.service.js
 *
 * Short-lived one-time passwords for:
 *   - Email verification on registration
 *   - Phone verification
 *   - Password reset
 *
 * Flow: generate raw code → bcrypt hash → store → publish to notification service
 * Verification: compare presented code against stored hash, track wrong guesses.
 */

import prisma  from '../../prisma/client.js';
import config  from '../config/index.js';
import logger  from '../utils/logger.js';
import { generateOtp, hashOtp, verifyOtp } from '../utils/crypto.utils.js';
import { publishEvent } from './rabbitmq.service.js';
import { UnauthorizedError, TooManyRequestsError } from '../utils/errors.js';

// ─── Issue OTP ───────────────────────────────────────────────────────────────

export async function issueOtp(userId, purpose, recipient) {
  // Invalidate any existing unused OTPs for this user+purpose
  await prisma.otpCode.updateMany({
    where: { userId, purpose, isUsed: false },
    data:  { isUsed: true },
  });

  const raw      = generateOtp();
  const codeHash = await hashOtp(raw);
  const expiresAt = new Date(Date.now() + config.security.otpExpiryMin * 60 * 1000);

  await prisma.otpCode.create({
    data: { userId, codeHash, purpose, recipient, expiresAt },
  });

  // Publish to notification service via RabbitMQ
  await publishEvent('auth.otp.issued', {
    userId,
    purpose,
    recipient,
    code:             raw,       // raw code — notification service renders and sends it
    expiresInMinutes: config.security.otpExpiryMin,
  });

  logger.info({ msg: 'OTP issued', userId, purpose, recipient });

  // In development, return the raw code so it can be used without email/SMS
  return config.isProd ? null : raw;
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────

export async function verifyOtpCode(userId, purpose, rawCode) {
  const record = await prisma.otpCode.findFirst({
    where: {
      userId,
      purpose,
      isUsed:   false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    throw new UnauthorizedError('OTP not found, already used, or expired', 'OTP_INVALID');
  }

  // Track wrong guesses — invalidate after max attempts
  if (record.attempts >= config.security.otpMaxAttempts) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data:  { isUsed: true },
    });
    throw new TooManyRequestsError('Too many incorrect OTP attempts. Please request a new code.');
  }

  const valid = await verifyOtp(rawCode, record.codeHash);

  if (!valid) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data:  { attempts: { increment: 1 } },
    });
    const remaining = config.security.otpMaxAttempts - record.attempts - 1;
    throw new UnauthorizedError(`Incorrect OTP. ${remaining} attempt(s) remaining.`, 'OTP_WRONG');
  }

  // Mark as used
  await prisma.otpCode.update({
    where: { id: record.id },
    data:  { isUsed: true },
  });

  return true;
}
