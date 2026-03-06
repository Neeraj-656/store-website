/**
 * rateLimit.middleware.js
 *
 * Enterprise-grade Redis-backed rate limiting.
 *
 * ✔ Explicit Redis connection control
 * ✔ No offline queue
 * ✔ No startup race conditions
 * ✔ Shared counters across gateway replicas
 *
 * Required:
 *   REDIS_URL=redis://127.0.0.1:6379
 */

import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const { windowMs, globalMax, authMax } = config.rateLimit;

// ───────────────────────────────────────────────────────────────
// Redis Client (Lazy Connect)
// ───────────────────────────────────────────────────────────────

const redis = new Redis(config.redisUrl, {
  lazyConnect: true,          // We control when to connect
  enableOfflineQueue: false,  // Fail fast if misused
  maxRetriesPerRequest: 1,
});

redis.on('error', (err) => {
  logger.error({ msg: 'Redis rate-limit client error', err });
});

redis.on('connect', () => {
  logger.info('Redis rate-limit client connected');
});

// ───────────────────────────────────────────────────────────────
// Explicit Initialization
// ───────────────────────────────────────────────────────────────

async function initRedis() {
  try {
    await redis.connect();
    await redis.ping();
    logger.info('Redis connection verified for rate limiting');
  } catch (err) {
    logger.error({
      msg: 'Redis connection failed during startup',
      err,
    });
    process.exit(1); // Fail hard — infra dependency
  }
}

// Immediately initialize on module load
await initRedis();

// ───────────────────────────────────────────────────────────────
// Store Factory (after connection is guaranteed)
// ───────────────────────────────────────────────────────────────

function makeStore(prefix) {
  return new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix,
  });
}

// ───────────────────────────────────────────────────────────────
// Limiters
// ───────────────────────────────────────────────────────────────

export const globalLimiter = rateLimit({
  windowMs,
  max: globalMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:global:'),
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests, please try again later',
  },
});

export const authLimiter = rateLimit({
  windowMs,
  max: authMax,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('rl:auth:'),
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many auth requests, please slow down',
  },
});