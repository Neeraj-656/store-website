import express from 'express';
import helmet from 'helmet';
import { correlationId } from './middlewares/auth.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import reviewRoutes from './routes/review.routes.js';

const app = express();

// ─── Security ──────────────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);

// ─── Correlation / Trace ID ────────────────────────────────────────────────
app.use(correlationId);

// ─── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json());

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/reviews', reviewRoutes);

// ─── 404 + Error Handler ───────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;