import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

// ─── Correlation / Trace ID ───────────────────────────────────────────────────

export function correlationId(req, res, next) {
  req.requestId = req.headers['x-request-id'] ?? uuidv4();
  res.setHeader('x-request-id', req.requestId);
  next();
}

// ─── JWT Authentication ───────────────────────────────────────────────────────

export function authenticate(req, _res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, config.auth.jwtSecret, {
      audience: config.auth.audience || undefined,
      issuer: config.auth.issuer || undefined,
    });
    req.user = payload;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

// ─── Role Guard ───────────────────────────────────────────────────────────────

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}

// ─── Internal Service Token ───────────────────────────────────────────────────

export function internalOnly(req, _res, next) {
  const token = req.headers['x-internal-service-token'];
  if (token !== config.internalToken) {
    return next(new UnauthorizedError('Invalid internal service token'));
  }
  next();
}