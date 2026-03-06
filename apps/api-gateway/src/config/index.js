import 'dotenv/config';

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key, fallback) => process.env[key] ?? fallback;

const config = {
  port:    parseInt(optional('PORT', '8080'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),

  // ─── Downstream service URLs ────────────────────────────────────────────
  services: {
    auth:      optional('AUTH_SERVICE_URL',      'http://localhost:3002'),
    catalog:   optional('CATALOG_SERVICE_URL',   'http://localhost:3003'),
    order:     optional('ORDER_SERVICE_URL',     'http://localhost:3006'),
    payment:   optional('PAYMENT_SERVICE_URL',   'http://localhost:3007'),
    review:    optional('REVIEW_SERVICE_URL',    'http://localhost:3009'),
    inventory: optional('INVENTORY_SERVICE_URL', 'http://localhost:3004'),
    vendor:    optional('VENDOR_SERVICE_URL',    'http://localhost:3010'),
    payout:    optional('PAYOUT_SERVICE_URL',    'http://localhost:3008'),
    admin:     optional('ADMIN_SERVICE_URL',     'http://localhost:3001'),
  },

  // ─── Auth ───────────────────────────────────────────────────────────────
  // RS256 public key is fetched from the auth service at startup.
  // Provide AUTH_PUBLIC_KEY as a fallback (PEM string) to skip the fetch.
  authPublicKey: optional('AUTH_PUBLIC_KEY', ''),

  // Internal service token — gateway injects this for service-to-service calls.
  // Changed from optional() to required() so the gateway fails fast at startup
  // rather than silently injecting an empty string (Issue 9 fix).
  internalServiceToken: required('INTERNAL_SERVICE_TOKEN'),

  // ─── Redis ──────────────────────────────────────────────────────────────
  // Required for distributed rate limiting across multiple gateway replicas.
  redisUrl: required('REDIS_URL'),

  // ─── Rate limiting ──────────────────────────────────────────────────────
  rateLimit: {
    windowMs:  parseInt(optional('RATE_LIMIT_WINDOW_MS',  '60000'), 10),
    globalMax: parseInt(optional('RATE_LIMIT_GLOBAL_MAX', '300'),   10),
    authMax:   parseInt(optional('RATE_LIMIT_AUTH_MAX',   '20'),    10),
  },

  // ─── CORS ───────────────────────────────────────────────────────────────
  corsOrigins: optional('CORS_ORIGINS', '*'),
};

export default config;
