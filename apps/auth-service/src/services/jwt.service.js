/**
 * jwt.service.js
 *
 * Issues and verifies RS256 JWTs.
 * The Auth Service signs with the PRIVATE key.
 * All downstream services verify with the PUBLIC key only.
 *
 * Access token payload (what req.user looks like in every service):
 * {
 *   sub:      "user-uuid",        // User.id
 *   id:       "user-uuid",        // alias for sub — downstream compat
 *   email:    "user@example.com",
 *   role:     "customer" | "vendor" | "admin",
 *   vendorId: "vendor-uuid",      // only set when role === 'vendor'
 *   adminId:  "admin-uuid",       // only set when role === 'admin'
 *   jti:      "unique-token-id",  // for denylist revocation
 *   iss:      "auth-service",
 *   aud:      "ecommerce-api",
 * }
 */

import jwt    from 'jsonwebtoken';
import config from '../config/index.js';
import { generateJti } from '../utils/crypto.utils.js';
import logger from '../utils/logger.js';

// ─── Issue Access Token ──────────────────────────────────────────────────────

export function issueAccessToken(user) {
  const jti = generateJti();

  const payload = {
    sub:      user.id,
    id:       user.id,        // downstream services use req.user.id
    email:    user.email,
    role:     user.role,
    jti,
    // Soft-link IDs — only included when set (avoids null values in token)
    ...(user.vendorId && { vendorId: user.vendorId }),
    ...(user.adminId  && { adminId:  user.adminId  }),
  };

  const token = jwt.sign(payload, config.jwt.privateKey, {
    algorithm: 'RS256',
    expiresIn: config.jwt.accessExpiresIn,
    issuer:    config.jwt.issuer,
    audience:  config.jwt.audience,
  });

  // Decode to get the actual expiry timestamp (handles string like '15m')
  const decoded = jwt.decode(token);

  return { token, jti, expiresAt: new Date(decoded.exp * 1000) };
}

// ─── Verify Access Token ──────────────────────────────────────────────────────
// Used by the auth service itself (e.g. /me, logout, change-password).
// Other services do their own verification with the PUBLIC key.

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwt.publicKey, {
      algorithms: ['RS256'],
      issuer:     config.jwt.issuer,
      audience:   config.jwt.audience,
    });
  } catch (err) {
    logger.debug({ msg: 'Access token verification failed', error: err.message });
    return null;
  }
}

// ─── Get token expiry from a raw JWT string ───────────────────────────────────
// Used to know when to expire the denylist entry.

export function getTokenExpiry(token) {
  const decoded = jwt.decode(token);
  if (!decoded?.exp) return null;
  return new Date(decoded.exp * 1000);
}
