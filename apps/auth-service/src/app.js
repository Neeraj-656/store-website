import express   from 'express';
import helmet    from 'helmet';
import { correlationId } from './middlewares/auth.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { globalLimit } from './middlewares/rate-limit.middleware.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

// ─── Security headers ────────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1); // trust first proxy (nginx / API gateway)

// ─── Core middleware ─────────────────────────────────────────────────────────
app.use(correlationId);
app.use(express.json({ limit: '16kb' }));  // auth payloads are tiny

// ─── Global rate limit ────────────────────────────────────────────────────────
app.use('/api/v1/auth', globalLimit);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
