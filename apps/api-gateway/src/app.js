/**
 * app.js — API Gateway
 *
 * Middleware stack (in order):
 *   1.  Helmet          — security headers
 *   2.  CORS            — configurable origins (wildcard blocked in production)
 *   3.  Body size guard — 1 MB hard cap on JSON/urlencoded payloads (Issue 4 fix)
 *   4.  correlationId   — x-correlation-id propagation
 *   5.  requestLogger   — structured access log
 *   6.  globalLimiter   — IP-based rate limit (all routes, Redis-backed)
 *   7.  authLimiter     — tighter limit on /api/v1/auth/*
 *   8.  stripInternal   — removes forged internal headers from inbound requests
 *   9.  blockInternal   — 403s internal-only endpoints
 *  10.  /health         — liveness probe (no auth)
 *  11.  /ready          — readiness probe (no auth)
 *  12.  authenticate    — RS256 JWT verification (skips public paths)
 *  13.  Proxy routes    — forward to downstream services
 *  14.  404 handler
 */

import express  from 'express';
import helmet   from 'helmet';
import config   from './config/index.js';
import { correlationId }   from './middleware/correlationId.middleware.js';
import { requestLogger }   from './middleware/requestLogger.middleware.js';
import { globalLimiter, authLimiter } from './middleware/rateLimit.middleware.js';
import {
  stripInternalHeaders,
  blockInternalRoutes,
  authenticate,
  getPublicKey,
} from './middleware/auth.middleware.js';
import { registerProxies } from './proxy.js';

export function createApp() {
  // ── CORS production guard ─────────────────────────────────────────────────
  if (config.nodeEnv === 'production' && config.corsOrigins === '*') {
    throw new Error(
      'CORS_ORIGINS must be set to specific origins in production. ' +
      'Wildcard (*) CORS is not allowed in production.',
    );
  }

  const app = express();

  app.set('trust proxy', 1);

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const origins = config.corsOrigins === '*'
      ? '*'
      : config.corsOrigins.split(',').map(o => o.trim());

    const origin  = req.headers.origin;
    const allowed = origins === '*' || (Array.isArray(origins) && origins.includes(origin));

    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin',  origin ?? '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-correlation-id');
      res.setHeader('Access-Control-Expose-Headers', 'x-correlation-id');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ── Request body size limits (Issue 4 fix) ─────────────────────────────────
  // Express does not enforce body size limits by default. Without these, a
  // malicious client can send a multi-gigabyte payload that causes the gateway
  // or downstream service to OOM-crash.
  //
  // Configured via BODY_LIMIT env var (default '1mb').
  // Webhook routes that need the raw body (e.g. Razorpay signature verification)
  // bypass JSON parsing at the service level — the gateway just enforces the
  // overall byte cap.
  //
  // PayloadTooLargeError (HTTP 413) is returned automatically by Express if the
  // limit is exceeded.
  const BODY_LIMIT = process.env.BODY_LIMIT ?? '1mb';
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

  // ── Correlation ID (must come before logging) ──────────────────────────────
  app.use(correlationId);

  // ── Request logging ────────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Rate limiting ──────────────────────────────────────────────────────────
  app.use(globalLimiter);
  app.use('/api/v1/auth', authLimiter);

  // ── Security: strip forged internal headers ────────────────────────────────
  app.use(stripInternalHeaders);

  // ── Block internal-only routes before any auth check ──────────────────────
  app.use(blockInternalRoutes);

  // ── Liveness probe ─────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status:  'UP',
      service: 'api-gateway',
      uptime:  process.uptime(),
      ts:      new Date().toISOString(),
    });
  });

  // ── Readiness probe ────────────────────────────────────────────────────────
  app.get('/ready', (_req, res) => {
    const publicKey = getPublicKey();
    if (!publicKey) {
      return res.status(503).json({
        status:  'NOT_READY',
        service: 'api-gateway',
        checks:  { publicKey: 'NOT_LOADED' },
        ts:      new Date().toISOString(),
      });
    }
    res.json({
      status:  'READY',
      service: 'api-gateway',
      checks:  { publicKey: 'LOADED' },
      ts:      new Date().toISOString(),
    });
  });

  // ── JWT authentication (skips public paths) ────────────────────────────────
  app.use(authenticate);

  // ── Proxy routes → downstream services ────────────────────────────────────
  registerProxies(app);

  // ── 413 handler — friendly response when body limit is exceeded ───────────
  // Express emits a SyntaxError or PayloadTooLargeError. The default express
  // error page is ugly; return a clean JSON response instead.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.status === 413 || err.type === 'entity.too.large') {
      return res.status(413).json({
        success: false,
        error:   'PAYLOAD_TOO_LARGE',
        message: `Request body exceeds the ${BODY_LIMIT} limit`,
      });
    }
    // Pass other errors to the default error handler
    res.status(err.status ?? 500).json({
      success: false,
      error:   'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  // ── 404 fallback ───────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error:   'NOT_FOUND',
      message: 'The requested route does not exist on this gateway',
    });
  });

  return app;
}
