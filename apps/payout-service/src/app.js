import express from 'express';
import helmet  from 'helmet';
import { correlationId } from './middlewares/auth.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import payoutRoutes from './routes/payout.routes.js';

const app = express();

app.use(helmet());
app.set('trust proxy', 1);
app.use(correlationId);

// Webhook route needs raw body — skip JSON parsing for that path
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/payouts/webhooks/')) return next();
  express.json()(req, res, next);
});

app.use('/api/v1/payouts', payoutRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
