/**
 * auth.middleware.js
 *
 * Fetches the RS256 public key from the Auth Service at startup, then
 * verifies every inbound JWT before forwarding.
 *
 * On success it attaches the decoded payload and injects downstream headers:
 *   x-user-id   → req.user.sub
 *   x-user-role → req.user.role
 *   x-user-email→ req.user.email  (if present)
 *
 * Routes listed in PUBLIC_PATHS bypass verification entirely.
 */

import { importSPKI, jwtVerify } from 'jose';
import config from '../config/index.js';
import logger from '../utils/logger.js';

// ─── Public key cache ────────────────────────────────────────────────────────

let _cachedKey = null;

/**
 * Fetches the RS256 public key PEM from the auth service and imports it.
 * Retries up to `retries` times with a delay before giving up.
 *
 * Handles all response shapes the auth service may return:
 *   { success: true, data: { publicKey: "..." } }   ← actual shape
 *   { publicKey: "..." }
 *   { public_key: "..." }
 *   "-----BEGIN PUBLIC KEY-----..."                  ← raw string fallback
 */
export async function loadPublicKey(retries = 5, delayMs = 3000) {
  // Allow supplying the key directly via env (useful in testing / k8s secrets)
  if (config.authPublicKey) {
    _cachedKey = await importSPKI(config.authPublicKey, 'RS256');
    logger.info('JWT public key loaded from AUTH_PUBLIC_KEY env var');
    return _cachedKey;
  }

  const url = `${config.services.auth}/api/v1/auth/public-key`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Auth service responded ${res.status}`);

      const body = await res.json();

      // Extract PEM from every known response shape:
      //   { success, data: { publicKey } }  ← auth-service actual format
      //   { publicKey }
      //   { public_key }
      //   raw string
      const pem =
        body?.data?.publicKey   ??   // { success: true, data: { publicKey: "..." } }
        body?.data?.public_key  ??   // { success: true, data: { public_key: "..." } }
        body?.publicKey         ??   // { publicKey: "..." }
        body?.public_key        ??   // { public_key: "..." }
        (typeof body === 'string' ? body : null);  // raw PEM string

      if (typeof pem !== 'string' || !pem.includes('PUBLIC KEY')) {
        throw new Error(
          `Unexpected public-key payload shape. Got: ${JSON.stringify(body).slice(0, 200)}`
        );
      }

      _cachedKey = await importSPKI(pem, 'RS256');
      logger.info('JWT public key loaded from auth service');
      return _cachedKey;
    } catch (err) {
      logger.warn({ err, attempt }, `Failed to fetch JWT public key (attempt ${attempt}/${retries})`);
      if (attempt < retries) await new Promise(r => setTimeout(r, delayMs));
    }
  }

  throw new Error('Could not load JWT public key after all retries. Gateway cannot start.');
}

export function getPublicKey() {
  if (!_cachedKey) throw new Error('Public key not yet loaded');
  return _cachedKey;
}

// ─── Path matching ───────────────────────────────────────────────────────────

/**
 * Routes that are fully public — no JWT required.
 * Entries are matched as prefixes against `req.path`.
 */
const PUBLIC_PATHS = [
  // Auth - registration, login, token refresh, public key, password reset
  '/api/v1/auth/register/customer',
  '/api/v1/auth/register/vendor',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/public-key',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/health',

  // Catalog - public product reads
  '/api/v1/products/public',

  // Reviews - public product ratings/listings (read-only)
  '/api/v1/reviews/products',

  // Gateway health check
  '/health',
];

/**
 * Routes that are completely blocked at the gateway —
 * they are intended for internal service-to-service traffic only.
 */
const BLOCKED_PATHS = [
  '/api/v1/auth/register/admin',
  '/api/v1/auth/internal',
  '/api/v1/payments/internal',
  '/api/v1/payouts/internal',
  '/api/v1/inventory/adjust',
  '/api/v1/inventory/reserve',
  '/api/v1/inventory/deduct',
  '/api/v1/inventory/release',
  '/api/v1/vendors/internal',
];

const isPublic  = (path) => PUBLIC_PATHS.some(p => path.startsWith(p));
const isBlocked = (path) => BLOCKED_PATHS.some(p => path.startsWith(p));

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * Blocks any inbound request that tries to set x-internal-service-token
 * — prevents callers from impersonating a trusted internal service.
 */
export function stripInternalHeaders(req, _res, next) {
  delete req.headers['x-internal-service-token'];
  delete req.headers['x-user-id'];
  delete req.headers['x-user-role'];
  delete req.headers['x-user-email'];
  next();
}

/**
 * Blocks routes reserved for internal service communication.
 */
export function blockInternalRoutes(req, res, next) {
  if (isBlocked(req.path)) {
    return res.status(403).json({
      success: false,
      error:   'FORBIDDEN',
      message: 'This endpoint is not accessible from the public API',
    });
  }
  next();
}

/**
 * Main JWT verification middleware.
 * Skips public paths; rejects everything else without a valid token.
 *
 * On success:
 *   - Attaches `req.user` (decoded JWT payload)
 *   - Sets x-user-id, x-user-role, x-user-email on the request
 *     so downstream services receive trusted identity info
 */
export function authenticate(req, res, next) {
  // Skip JWT check for public routes
  if (isPublic(req.path)) return next();

  const authHeader = req.headers.authorization ?? '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error:   'UNAUTHORIZED',
      message: 'Missing Authorization header',
    });
  }

  jwtVerify(token, getPublicKey(), { algorithms: ['RS256'] })
    .then(({ payload }) => {
      req.user = payload;

      // Inject trusted identity headers for downstream services
      req.headers['x-user-id']    = payload.sub   ?? payload.id    ?? '';
      req.headers['x-user-role']  = payload.role   ?? '';
      req.headers['x-user-email'] = payload.email  ?? '';

      // Catalog service needs x-vendor-id for vendor-scoped product routes
      if (payload.role === 'vendor') {
        req.headers['x-vendor-id'] = payload.sub ?? payload.id ?? '';
      }

      next();
    })
    .catch((err) => {
      logger.debug({ err }, 'JWT verification failed');
      return res.status(401).json({
        success: false,
        error:   'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    });
}

/**
 * Role-guard factory.
 * Usage: requireRole('admin')  or  requireRole(['admin', 'support'])
 */
export function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole || !allowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error:   'FORBIDDEN',
        message: `Requires one of: ${allowed.join(', ')}`,
      });
    }
    next();
  };
}