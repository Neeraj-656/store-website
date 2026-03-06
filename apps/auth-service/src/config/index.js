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
  port:    parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isProd:  optional('NODE_ENV', 'development') === 'production',

  // ── JWT ──────────────────────────────────────────────────────────────────
  // RS256 asymmetric keys.
  // Auth Service signs with the PRIVATE key.
  // All other services verify with the PUBLIC key.
  jwt: {
    // PEM strings — newlines encoded as \n in .env
    privateKey: required('JWT_PRIVATE_KEY').replace(/\\n/g, '\n'),
    publicKey:  required('JWT_PUBLIC_KEY').replace(/\\n/g, '\n'),
    issuer:     optional('JWT_ISSUER',   'auth-service'),
    audience:   optional('JWT_AUDIENCE', 'ecommerce-api'),
    // Token lifetimes
    accessExpiresIn:  optional('JWT_ACCESS_EXPIRES_IN',  '15m'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '30d'),
  },

  // ── Hashing ──────────────────────────────────────────────────────────────
  bcrypt: {
    // Work factor — 12 is a good balance of security vs. latency (~300ms)
    rounds: parseInt(optional('BCRYPT_ROUNDS', '12'), 10),
  },

  // ── Security ─────────────────────────────────────────────────────────────
  security: {
    // Account lockout after N consecutive failed logins
    maxFailedLogins:    parseInt(optional('MAX_FAILED_LOGINS',    '5'), 10),
    // How long to lock the account (minutes)
    lockoutDurationMin: parseInt(optional('LOCKOUT_DURATION_MIN', '15'), 10),
    // OTP expiry (minutes)
    otpExpiryMin:       parseInt(optional('OTP_EXPIRY_MIN',       '10'), 10),
    // Max wrong OTP guesses before invalidation
    otpMaxAttempts:     parseInt(optional('OTP_MAX_ATTEMPTS',     '5'), 10),
    // Rate-limit: max login attempts per IP per window
    ipLoginWindowMs:    parseInt(optional('IP_LOGIN_WINDOW_MS',   String(15 * 60 * 1000)), 10),
    ipLoginMax:         parseInt(optional('IP_LOGIN_MAX',         '20'), 10),
  },

  // ── Internal ─────────────────────────────────────────────────────────────
  internalToken: required('INTERNAL_SERVICE_TOKEN'),

  // ── RabbitMQ ─────────────────────────────────────────────────────────────
  rabbitmq: {
    url:      optional('RABBITMQ_URL',      'amqp://guest:guest@localhost:5672'),
    exchange: optional('RABBITMQ_EXCHANGE', 'ecommerce_events'),
  },
};

export default config;
