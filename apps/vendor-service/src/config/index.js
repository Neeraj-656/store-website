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
  port: parseInt(optional('PORT', '3005'), 10),
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

  // AES-256-GCM key for encrypting bank details — 32 bytes hex
  encryptionKey: required('ENCRYPTION_KEY'),

  upload: {
    dir: optional('UPLOAD_DIR', './uploads'),
    maxFileSizeMb: parseInt(optional('MAX_FILE_SIZE_MB', '10'), 10),
  },

  risk: {
    fraudScoreThreshold: parseInt(optional('FRAUD_SCORE_THRESHOLD', '70'), 10),
  },
};

export default config;
