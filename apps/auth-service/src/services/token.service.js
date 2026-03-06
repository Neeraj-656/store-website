/**
 * token.service.js
 *
 * Manages the refresh token lifecycle:
 *   - Issue: generate, hash, persist
 *   - Rotate: revoke old → issue new in same family
 *   - Theft detection: if a REVOKED token is presented, kill the entire family
 *   - Revoke: on logout or password change
 *
 * Refresh tokens are random bytes (base64url).
 * Only the SHA-256 hash is stored in DB.
 */

import prisma  from '../../prisma/client.js';
import config  from '../config/index.js';
import logger  from '../utils/logger.js';
import { generateRefreshToken, generateFamily, hashToken } from '../utils/crypto.utils.js';
import { UnauthorizedError } from '../utils/errors.js';

// ─── Issue a brand-new refresh token (first login) ──────────────────────────

export async function issueRefreshToken(userId, { ipAddress, userAgent } = {}) {
  const raw    = generateRefreshToken();
  const family = generateFamily();

  await _persist(userId, raw, family, ipAddress, userAgent);

  return { raw, family };
}

// ─── Rotate refresh token ────────────────────────────────────────────────────
// Present old raw token → revoke it → issue new token in same family.

export async function rotateRefreshToken(rawToken, { ipAddress, userAgent } = {}) {
  const hash = hashToken(rawToken);

  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

  if (!existing) {
    throw new UnauthorizedError('Refresh token not found', 'TOKEN_NOT_FOUND');
  }

  if (existing.expiresAt < new Date()) {
    // Expired — clean up and reject
    await prisma.refreshToken.delete({ where: { id: existing.id } });
    throw new UnauthorizedError('Refresh token expired', 'TOKEN_EXPIRED');
  }

  if (existing.isRevoked) {
    // 🚨 THEFT DETECTED — a previously revoked token was presented.
    // This means someone stole a token from this family.
    // Invalidate the entire family to force re-login on all devices.
    logger.warn({
      msg: 'Refresh token theft detected — invalidating entire family',
      userId: existing.userId,
      family: existing.family,
      tokenId: existing.id,
    });

    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, family: existing.family, isRevoked: false },
      data:  { isRevoked: true, revokedAt: new Date() },
    });

    throw new UnauthorizedError('Token reuse detected. Please log in again.', 'TOKEN_REUSE');
  }

  // Normal rotation — revoke old, issue new in same family
  const newRaw = generateRefreshToken();

  await prisma.$transaction(async (tx) => {
    const newRecord = await _persistTx(tx, existing.userId, newRaw, existing.family, ipAddress, userAgent);

    await tx.refreshToken.update({
      where: { id: existing.id },
      data:  { isRevoked: true, revokedAt: new Date(), replacedBy: newRecord.id },
    });
  });

  return { raw: newRaw, userId: existing.userId, family: existing.family };
}

// ─── Revoke a single refresh token ──────────────────────────────────────────

export async function revokeRefreshToken(rawToken) {
  const hash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash, isRevoked: false },
    data:  { isRevoked: true, revokedAt: new Date() },
  });
}

// ─── Revoke all refresh tokens for a user (logout everywhere / password change) ─

export async function revokeAllRefreshTokens(userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, isRevoked: false },
    data:  { isRevoked: true, revokedAt: new Date() },
  });
}

// ─── Add access token to denylist ────────────────────────────────────────────

export async function denylistAccessToken(jti, userId, expiresAt) {
  await prisma.accessTokenDenylist.upsert({
    where:  { jti },
    create: { jti, userId, expiresAt },
    update: {},  // idempotent
  });
}

// ─── Check access token denylist ─────────────────────────────────────────────

export async function isTokenDenylisted(jti) {
  const entry = await prisma.accessTokenDenylist.findUnique({ where: { jti } });
  return !!entry;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _expiresAt() {
  const ms = parseExpiresIn(config.jwt.refreshExpiresIn);
  return new Date(Date.now() + ms);
}

async function _persist(userId, raw, family, ipAddress, userAgent) {
  return prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      family,
      ipAddress:  ipAddress ?? null,
      userAgent:  userAgent  ?? null,
      expiresAt:  _expiresAt(),
    },
  });
}

async function _persistTx(tx, userId, raw, family, ipAddress, userAgent) {
  return tx.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      family,
      ipAddress:  ipAddress ?? null,
      userAgent:  userAgent  ?? null,
      expiresAt:  _expiresAt(),
    },
  });
}

// Convert strings like '30d', '7d', '15m' to milliseconds
function parseExpiresIn(str) {
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const match = String(str).match(/^(\d+)([smhd])$/);
  if (!match) return 30 * 86_400_000; // default 30 days
  return parseInt(match[1], 10) * units[match[2]];
}
