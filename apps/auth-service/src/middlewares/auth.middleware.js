/**
 * auth.middleware.js
 *
 * Used only by the Auth Service's own protected routes (/me, /logout, etc.).
 * All OTHER services do their own JWT verification with the public key.
 *
 * Key addition over other services: denylist check on every request.
 * If the jti is in AccessTokenDenylist the token was explicitly revoked
 * (logout, password change, suspension) and must be rejected even if the
 * signature is still valid.
 */

import { v4 as uuidv4 } from 'uuid';
import { verifyAccessToken } from '../services/jwt.service.js';
import { isTokenDenylisted } from '../services/token.service.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import config from '../config/index.js';

// ─── Correlation ID ───────────────────────────────────────────────────────────

export function correlationId(req, res, next) {
  req.requestId = req.headers['x-request-id'] ?? uuidv4();
  res.setHeader('x-request-id', req.requestId);
  next();
}

// ─── Authenticate ─────────────────────────────────────────────────────────────

export function authenticate(req, _res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token   = header.split(' ')[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    return next(new UnauthorizedError('Invalid or expired access token', 'TOKEN_INVALID'));
  }

  req.user        = payload;
  req.accessToken = token;   // kept for logout / password-change handlers
  next();
}

// ─── Denylist check ──────────────────────────────────────────────────────────
// Must run AFTER authenticate(). Rejects explicitly revoked tokens.

export function checkDenylist(req, _res, next) {
  const jti = req.user?.jti;
  if (!jti) return next();

  isTokenDenylisted(jti)
    .then((denied) => {
      if (denied) return next(new UnauthorizedError('Token has been revoked. Please log in again.', 'TOKEN_REVOKED'));
      next();
    })
    .catch(next);
}

// ─── Role guard ───────────────────────────────────────────────────────────────

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}

// ─── Internal service token ───────────────────────────────────────────────────

export function internalOnly(req, _res, next) {
  const token = req.headers['x-internal-service-token'];
  if (token !== config.internalToken) {
    return next(new UnauthorizedError('Invalid internal service token'));
  }
  next();
}
