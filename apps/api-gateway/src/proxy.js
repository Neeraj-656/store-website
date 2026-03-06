/**
 * proxy.js — API Gateway
 *
 * Issue 5 fix — static INTERNAL_SERVICE_TOKEN replaced with short-lived
 * asymmetrically signed JWTs issued per service via getServiceToken().
 * Each forwarded request gets a JWT with: iss=api-gateway, aud=<service-name>,
 * exp=now+60s. Downstream services verify with the PUBLIC key only.
 *
 * Issue 10 fix — proxyTimeout / timeout added to every makeProxy call.
 */

import { createProxyMiddleware } from 'http-proxy-middleware';
import config              from '../src/config/index.js';
import logger              from '../src/utils/logger.js';
import { getServiceToken } from './internal-token.service.js';

const { services } = config;

// ─── Shared proxy factory ─────────────────────────────────────────────────────

/**
 * @param {string} target      - Downstream service base URL
 * @param {string} serviceName - Logical name used as the JWT audience
 * @param {object} opts        - Additional http-proxy-middleware options
 */
function makeProxy(target, serviceName, opts = {}) {
  return createProxyMiddleware({
    target,
    changeOrigin:  true,
    proxyTimeout:  10_000,  // upstream must respond within 10 s
    timeout:       11_000,  // socket-level timeout

    on: {
      proxyReq(proxyReq, req) {
        // ── Correlation ID ─────────────────────────────────────────────────
        if (req.correlationId) {
          proxyReq.setHeader('x-correlation-id', req.correlationId);
        }

        // ── Short-lived service JWT (Issue 5 fix) ──────────────────────────
        // Replace the static shared token with a scoped, expiring JWT signed
        // by the gateway's private key. The downstream service verifies with
        // the corresponding public key and checks aud === its own service name.
        const serviceToken = getServiceToken(serviceName);
        if (serviceToken) {
          proxyReq.setHeader('x-internal-service-token', serviceToken);
        }

        // ── User identity headers from auth middleware ─────────────────────
        if (req.headers['x-user-id'])    proxyReq.setHeader('x-user-id',    req.headers['x-user-id']);
        if (req.headers['x-user-role'])  proxyReq.setHeader('x-user-role',  req.headers['x-user-role']);
        if (req.headers['x-user-email']) proxyReq.setHeader('x-user-email', req.headers['x-user-email']);
        if (req.headers['x-vendor-id'])  proxyReq.setHeader('x-vendor-id',  req.headers['x-vendor-id']);
      },

      error(err, req, res) {
        const isTimeout = err.code === 'ECONNRESET' || err.message?.includes('timeout');
        const status    = isTimeout ? 504 : 502;
        const error     = isTimeout ? 'GATEWAY_TIMEOUT' : 'BAD_GATEWAY';
        const message   = isTimeout
          ? 'Upstream service did not respond in time. Please try again.'
          : 'Upstream service is unavailable. Please try again later.';

        logger.error({ err, path: req.path, target, isTimeout }, `Proxy error — ${error}`);

        if (!res.headersSent) {
          res.status(status).json({ success: false, error, message });
        }
      },
    },
    ...opts,
  });
}

// ─── Route registrations ──────────────────────────────────────────────────────

export function registerProxies(app) {
  app.use('/api/v1/auth',      makeProxy(services.auth,      'auth-service'));
  app.use('/api/v1/products',  makeProxy(services.catalog,   'catalog-service'));
  app.use('/api/v1/orders',    makeProxy(services.order,     'order-service'));
  app.use('/api/v1/payments',  makeProxy(services.payment,   'payment-service'));
  app.use('/api/v1/reviews',   makeProxy(services.review,    'review-service'));
  app.use('/api/v1/inventory', makeProxy(services.inventory, 'inventory-service'));
  app.use('/api/v1/vendors',   makeProxy(services.vendor,    'vendor-service'));
  app.use('/api/v1/payouts',   makeProxy(services.payout,    'payout-service'));
  app.use('/api/v1/admin',     makeProxy(services.admin,     'admin-service'));
}
