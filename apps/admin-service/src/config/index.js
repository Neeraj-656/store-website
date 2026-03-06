import 'dotenv/config';

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key, fallback) {
  return process.env[key] ?? fallback;
}

const config = {
  port:    parseInt(optional('PORT', '3008'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),

  auth: {
    jwtSecret: required('JWT_SECRET'),
    audience:  optional('JWT_AUDIENCE', ''),
    issuer:    optional('JWT_ISSUER', 'auth-service'),
  },

  internalToken: required('INTERNAL_SERVICE_TOKEN'),

  rabbitmq: {
    url:      optional('RABBITMQ_URL',      'amqp://guest:guest@localhost:5672'),
    exchange: optional('RABBITMQ_EXCHANGE', 'ecommerce_events'),
  },

  // Internal service base URLs — all traffic stays inside private VPC/Docker network
  services: {
    vendor:  optional('VENDOR_SERVICE_URL',  'http://vendor-service:3005'),
    catalog: optional('CATALOG_SERVICE_URL', 'http://catalog-service:3002'),
    order:   optional('ORDER_SERVICE_URL',   'http://order-service:3001'),
    payment: optional('PAYMENT_SERVICE_URL', 'http://payment-service:3004'),
    payout:  optional('PAYOUT_SERVICE_URL',  'http://payout-service:3007'),
    review:  optional('REVIEW_SERVICE_URL',  'http://review-service:3006'),
  },

  // CORS — wildcard is blocked in production (see app.js guard)
  corsOrigins: optional('CORS_ORIGINS', '*'),

  pagination: {
    defaultLimit: 20,
    maxLimit:     100,
  },
};

export default config;
