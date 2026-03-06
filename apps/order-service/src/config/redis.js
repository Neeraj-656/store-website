import Redis  from 'ioredis';
import logger from './logger.js';

let client = null;

export function getRedisClient() {
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL environment variable is not set');

  client = new Redis(url, {
    retryStrategy:    (times) => Math.min(1000 * 2 ** times, 30_000),
    enableReadyCheck: true,
    lazyConnect:      false,
  });

  client.on('connect',      ()    => logger.info('Redis connected'));
  client.on('ready',        ()    => logger.info('Redis ready'));
  client.on('error',        (err) => logger.error('Redis error:', err.message));
  client.on('close',        ()    => logger.warn('Redis connection closed'));
  client.on('reconnecting', ()    => logger.warn('Redis reconnecting...'));

  return client;
}

export async function connectRedis() {
  const c = getRedisClient();
  await c.ping();
  logger.info('Redis ping OK');
}

export async function disconnectRedis() {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis disconnected');
  }
}
