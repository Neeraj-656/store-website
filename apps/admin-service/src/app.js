import express from 'express';
import helmet  from 'helmet';
import cors    from 'cors';
import config  from './config/index.js';
import { correlationId } from './middlewares/auth.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import adminRoutes  from './routes/admin.routes.js';
import healthRoutes from './routes/health.routes.js';

// ── CORS production guard (Issue 8 fix) ──────────────────────────────────────
if (config.nodeEnv === 'production' && config.corsOrigins === '*') {
  throw new Error(
    'CORS_ORIGINS must be set to specific origins in production. ' +
    'Wildcard (*) CORS is not allowed in production.',
  );
}

const app = express();

app.use(helmet());
app.set('trust proxy', 1);
app.use(correlationId);
app.use(express.json());

// ── CORS ──────────────────────────────────────────────────────────────────────
if (config.corsOrigins) {
  const origins = config.corsOrigins === '*' ? '*' : config.corsOrigins.split(',').map(o => o.trim());
  app.use(cors({ origin: origins, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
}

// ── Health / readiness — no auth required (Issue 11 fix) ─────────────────────
app.use(healthRoutes);

// ── Admin API ─────────────────────────────────────────────────────────────────
app.use('/api/v1/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
