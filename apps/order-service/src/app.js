import express        from 'express';
import helmet         from 'helmet';
import cors           from 'cors';
import rateLimit      from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisClient }            from './config/redis.js';
import orderRoutes                   from './routes/orderRoutes.js';
import healthRouter                  from './health.js';
import correlationId                 from './middleware/correlationId.js';
import { errorHandler, notFound }    from './middleware/errorHandler.js';
import logger                        from './config/logger.js';

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS — explicit origin required; no wildcard fallback in production ────────
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin && process.env.NODE_ENV === 'production') {
  throw new Error('CORS_ORIGIN env var must be set in production. Wildcard (*) is not permitted.');
}
app.use(cors({
  origin:         corsOrigin || 'http://localhost:3000',
  methods:        ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-correlation-id', 'x-idempotency-key'],
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ── Rate limiting — Redis-backed for global enforcement across all pods ───────
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests, please try again later.' },
  store: new RedisStore({
    sendCommand: (...args) => getRedisClient().call(...args),
  }),
}));

// ── Correlation ID ────────────────────────────────────────────────────────────
app.use(correlationId);

// ── Request logging ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  req.log = logger.child(req.correlationId);
  req.log.info(`${req.method} ${req.originalUrl}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/health',     healthRouter);
app.use('/api/orders', orderRoutes);

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
