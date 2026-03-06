/**
 * token-cleanup.worker.js
 *
 * Periodic cleanup of stale token data to keep the DB lean.
 *
 * Runs two sweeps:
 *   1. AccessTokenDenylist — delete entries whose expiresAt has passed.
 *      Once expired, the JWT itself is invalid, so the denylist entry is useless.
 *   2. RefreshToken        — delete revoked or expired tokens older than 30 days.
 *      Keeps history for the most recent period for theft forensics.
 *   3. OtpCode             — delete used/expired OTPs older than 24 hours.
 *   4. LoginAttempt        — delete records older than RETENTION days.
 */

import prisma  from '../../prisma/client.js';
import logger  from '../utils/logger.js';

const CLEANUP_INTERVAL_MS     = 60 * 60 * 1000;   // every 1 hour
const REFRESH_TOKEN_RETAIN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LOGIN_ATTEMPT_RETAIN_DAYS = 90;

async function sweepDenylist() {
  const result = await prisma.accessTokenDenylist.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (result.count > 0) {
    logger.info({ msg: 'Token cleanup: denylist entries swept', count: result.count });
  }
}

async function sweepRefreshTokens() {
  const cutoff = new Date(Date.now() - REFRESH_TOKEN_RETAIN_MS);
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { isRevoked: true,  createdAt: { lt: cutoff } },
        { expiresAt: { lt: new Date() } },
      ],
    },
  });
  if (result.count > 0) {
    logger.info({ msg: 'Token cleanup: refresh tokens swept', count: result.count });
  }
}

async function sweepOtps() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.otpCode.deleteMany({
    where: {
      OR: [
        { isUsed: true,  createdAt: { lt: cutoff } },
        { expiresAt:     { lt: cutoff } },
      ],
    },
  });
  if (result.count > 0) {
    logger.debug({ msg: 'Token cleanup: OTPs swept', count: result.count });
  }
}

async function sweepLoginAttempts() {
  const cutoff = new Date(
    Date.now() - LOGIN_ATTEMPT_RETAIN_DAYS * 24 * 60 * 60 * 1000,
  );
  const result = await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (result.count > 0) {
    logger.info({ msg: 'Token cleanup: login attempts swept', count: result.count });
  }
}

async function runCleanup() {
  try {
    await sweepDenylist();
    await sweepRefreshTokens();
    await sweepOtps();
    await sweepLoginAttempts();
  } catch (err) {
    logger.error({ msg: 'Token cleanup worker error', err: err.message });
  }
}

export function startTokenCleanupWorker() {
  logger.info('Token cleanup worker started');
  // Run immediately on startup then on interval
  runCleanup();
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}
