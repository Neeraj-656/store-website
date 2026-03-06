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
  port: parseInt(optional('PORT', '3004'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isProd: optional('NODE_ENV', 'development') === 'production',

  auth: {
    jwtSecret: required('JWT_SECRET'),
    audience: optional('JWT_AUDIENCE', ''),
    issuer: optional('JWT_ISSUER', 'auth-service'),
  },

  internalToken: required('INTERNAL_SERVICE_TOKEN'),

  rabbitmq: {
    url: optional('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
    exchange: optional('RABBITMQ_EXCHANGE', 'ecommerce_events'),
  },
};

export default config;