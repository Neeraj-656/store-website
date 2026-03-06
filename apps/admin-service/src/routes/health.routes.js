/**
 * health.routes.js — Admin Service
 *
 * /health  → liveness probe  (is the process alive and the HTTP server running?)
 * /ready   → readiness probe (are all critical dependencies reachable?)
 *
 * Kubernetes should point:
 *   livenessProbe  → GET /health
 *   readinessProbe → GET /ready
 *
 * Issue 11 fix: /ready probes PostgreSQL and RabbitMQ. Kubernetes will stop
 * routing traffic to a pod that returns 503 on /ready, preventing requests
 * from being sent to an instance whose DB or broker connection is broken.
 */

import { Router } from 'express';
import prisma from '../../prisma/client.js';
import { getChannelWrapper } from '../services/rabbitmq.service.js';
import logger from '../utils/logger.js';

const router = Router();

// ─── Liveness (/health) ───────────────────────────────────────────────────────
// Quick — just confirms the process is running and the event loop is healthy.
// Never probe dependencies here; a slow DB should not kill the process.

router.get('/health', (_req, res) => {
  res.json({
    status:  'UP',
    service: 'admin-service',
    uptime:  process.uptime(),
    ts:      new Date().toISOString(),
  });
});

// ─── Readiness (/ready) ───────────────────────────────────────────────────────
// Returns 200 only when all critical dependencies are reachable.
// Returns 503 with a breakdown when any dependency is down.

router.get('/ready', async (_req, res) => {
  const checks = {};
  let healthy = true;

  // 1. PostgreSQL — run a lightweight SELECT 1
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = 'UP';
  } catch (err) {
    checks.postgres = 'DOWN';
    healthy = false;
    logger.warn({ msg: 'Readiness check: PostgreSQL unreachable', err: err.message });
  }

  // 2. RabbitMQ — check whether the channel wrapper reports a live channel
  try {
    const ch = getChannelWrapper();
    const connected = ch?.channelCount > 0 || ch?._channel != null;
    checks.rabbitmq = connected ? 'UP' : 'DOWN';
    if (!connected) healthy = false;
  } catch (err) {
    checks.rabbitmq = 'DOWN';
    healthy = false;
    logger.warn({ msg: 'Readiness check: RabbitMQ unreachable', err: err.message });
  }

  const status = healthy ? 200 : 503;
  res.status(status).json({
    status:  healthy ? 'READY' : 'NOT_READY',
    service: 'admin-service',
    checks,
    ts:      new Date().toISOString(),
  });
});

export default router;
