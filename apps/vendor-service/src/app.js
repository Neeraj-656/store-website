import express from 'express';
import helmet from 'helmet';
import { correlationId } from './middlewares/auth.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import vendorRoutes from './routes/vendor.routes.js';

const app = express();

app.use(helmet());
app.set('trust proxy', 1);

app.use(correlationId);
app.use(express.json());

app.use('/api/v1/vendors', vendorRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
