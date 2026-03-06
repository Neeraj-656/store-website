import express from 'express';
import helmet from 'helmet';
import { correlationId } from './middlewares/auth.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import paymentRoutes from './routes/payment.routes.js';

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);

// ─── Correlation ID ───────────────────────────────────────────────────────────
app.use(correlationId);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// Webhook route uses express.raw() registered inside the router.
// All other routes get JSON parsing here.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/payments/webhooks/')) return next();
  express.json()(req, res, next);
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/payments', paymentRoutes);

// ─── Catch-all & Error Handling ───────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;