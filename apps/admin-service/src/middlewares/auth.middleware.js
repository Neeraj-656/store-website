/**
 * auth.middleware.js — Admin Service
 *
 * Production-Ready Version
 *
 * ✔ ES256 internal JWT verification (asymmetric)
 * ✔ Enforces max 60-second token age
 * ✔ Clock tolerance for distributed systems
 * ✔ No async misuse
 * ✔ No silent security downgrade
 * ✔ Optimized DB reuse
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { timingSafeEqual } from 'crypto';
import config from '../config/index.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import prisma from '../../prisma/client.js';
import logger from '../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Internal JWT Configuration
// ─────────────────────────────────────────────────────────────────────────────

const INTERNAL_PUBLIC_KEY = process.env.INTERNAL_SIGNING_KEY_PUBLIC || null;
const INTERNAL_AUDIENCE   = 'admin-service';
const INTERNAL_ISSUER     = 'api-gateway';
const INTERNAL_MAX_AGE    = 60; // seconds
const CLOCK_TOLERANCE     = 5;  // seconds

if (!INTERNAL_PUBLIC_KEY) {
  logger.error(
    'FATAL: INTERNAL_SIGNING_KEY_PUBLIC is not configured. ' +
    'Internal service authentication will fail.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Correlation ID Middleware
// ─────────────────────────────────────────────────────────────────────────────

export function correlationId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.requestId);
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// User JWT Authentication
// ─────────────────────────────────────────────────────────────────────────────

export function authenticate(req, _res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  try {
    req.user = jwt.verify(header.split(' ')[1], config.auth.jwtSecret, {
      audience: config.auth.audience || undefined,
      issuer:   config.auth.issuer   || undefined,
    });

    next();
  } catch (err) {
    logger.warn({ msg: 'User JWT verification failed', err: err.message });
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin Guard
// ─────────────────────────────────────────────────────────────────────────────

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Role-Based Guard (Optimized)
// ─────────────────────────────────────────────────────────────────────────────

export function requireAdminRole(...adminRoles) {
  return async (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());

    try {
      if (!req.adminUser) {
        const adminUser = await prisma.adminUser.findUnique({
          where:  { userId: req.user.id },
          select: { id: true, role: true, isActive: true },
        });

        if (!adminUser || !adminUser.isActive) {
          return next(
            new ForbiddenError('Admin account not found or deactivated')
          );
        }

        req.adminUser = adminUser;
      }

      if (!adminRoles.includes(req.adminUser.role)) {
        return next(
          new ForbiddenError(`Required role: ${adminRoles.join(' or ')}`)
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Attach Admin User
// ─────────────────────────────────────────────────────────────────────────────

export async function attachAdminUser(req, _res, next) {
  if (req.adminUser) return next();
  if (!req.user) return next(new UnauthorizedError());

  try {
    const adminUser = await prisma.adminUser.findUnique({
      where:  { userId: req.user.id },
      select: { id: true, role: true, isActive: true },
    });

    if (!adminUser || !adminUser.isActive) {
      return next(
        new ForbiddenError('Admin account not found or deactivated')
      );
    }

    req.adminUser = adminUser;
    next();
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Service Authentication (ES256)
// ─────────────────────────────────────────────────────────────────────────────

export function internalOnly(req, _res, next) {
  const token = req.headers['x-internal-service-token'];

  if (!token) {
    return next(new UnauthorizedError('Missing internal service token'));
  }

  if (!INTERNAL_PUBLIC_KEY) {
    return next(
      new Error('Internal authentication misconfigured (missing public key)')
    );
  }

  try {
    const payload = jwt.verify(token, INTERNAL_PUBLIC_KEY, {
      algorithms: ['ES256'],
      audience: INTERNAL_AUDIENCE,
      issuer: INTERNAL_ISSUER,
      clockTolerance: CLOCK_TOLERANCE,
    });

    const now = Math.floor(Date.now() / 1000);

    // Enforce strict 60-second max age
    if (!payload.iat || now - payload.iat > INTERNAL_MAX_AGE) {
      logger.warn({ msg: 'Internal JWT too old' });
      return next(new UnauthorizedError('Internal token expired'));
    }

    // Optional: ensure exp - iat <= 60 as well
    if (payload.exp && payload.iat && payload.exp - payload.iat > INTERNAL_MAX_AGE) {
      logger.warn({ msg: 'Internal JWT lifetime exceeds policy' });
      return next(new UnauthorizedError('Invalid internal token lifetime'));
    }

    // Expose calling service identity
    req.internalCaller = payload.sub || payload.iss;

    next();
  } catch (err) {
    logger.warn({
      msg: 'Internal JWT verification failed',
      err: err.message,
    });

    next(new UnauthorizedError('Invalid or expired internal service token'));
  }
}