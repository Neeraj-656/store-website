import express from 'express';
import inventoryRoutes       from './routes/inventory.routes.js';
import { globalErrorHandler } from './middleware/globalErrorHandler.js';
import { prisma }            from './lib/prisma.js';
import { rabbitMQ }          from './lib/rabbitmq.js';

const app = express();

// ===================================
// FIX #10: trust proxy MUST be first
// ===================================
// Express reads x-forwarded-for and x-forwarded-proto only after trust proxy
// is set. The rate limiter and any IP-based middleware registered after this
// point will now correctly see the real client IP, not the load balancer IP.
app.set('trust proxy', 1);

// ===================================
// Core Middleware
// ===================================
app.use(express.json({ limit: '1mb' }));

// ===================================
// LIVENESS PROBE
// ===================================
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    service: 'inventory-service',
    status:  'healthy',
  });
});

// ===================================
// READINESS PROBE
// ===================================
app.get('/ready', async (_req, res) => {
  try {
    const isDbHealthy = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);

    const isMqHealthy = rabbitMQ?.isReady ?? false;
    const isReady     = isDbHealthy && isMqHealthy;

    return res.status(isReady ? 200 : 503).json({
      success:      isReady,
      dependencies: {
        database: isDbHealthy,
        rabbitmq: isMqHealthy,
      },
    });
  } catch (err) {
    return res.status(503).json({
      success:      false,
      dependencies: { database: false, rabbitmq: false },
    });
  }
});

// ===================================
// API ROUTES
// ===================================
app.use('/api/v1/inventory', inventoryRoutes);

// ===================================
// 404 FALLBACK
// ===================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code:    'ROUTE_NOT_FOUND',
      message: `Route ${req.originalUrl} not found`,
    },
  });
});

// ===================================
// GLOBAL ERROR HANDLER — MUST BE LAST
// ===================================
app.use(globalErrorHandler);

export default app;
