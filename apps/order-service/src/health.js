import { Router }        from 'express';
import { prisma }        from './config/prisma.js';
import { isConnected }   from './config/rabbitmq.js';
import { getRedisClient } from './config/redis.js';

const router = Router();

// GET /health — shallow, instant (load balancers, liveness probe)
router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'order-service', ts: new Date().toISOString() });
});

// GET /health/ready — deep check (Kubernetes readinessProbe)
router.get('/ready', async (_req, res) => {
  const checks = {};
  let allOk = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = 'ok';
  } catch (err) {
    checks.postgres = `error: ${err.message}`;
    allOk = false;
  }

  checks.rabbitmq = isConnected() ? 'ok' : 'error: not connected';
  if (!isConnected()) allOk = false;

  try {
    const pong = await getRedisClient().ping();
    checks.redis = pong === 'PONG' ? 'ok' : `unexpected response: ${pong}`;
    if (pong !== 'PONG') allOk = false;
  } catch (err) {
    checks.redis = `error: ${err.message}`;
    allOk = false;
  }

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'not_ready',
    checks,
  });
});

export default router;
