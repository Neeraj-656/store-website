import logger from '../config/logger.js';

export function notFound(req, res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status        = err.statusCode || 500;
  const correlationId = req.correlationId;

  if (status >= 500) {
    logger.error(`[${status}] ${err.message}`, { correlationId, stack: err.stack });
  } else {
    logger.warn(`[${status}] ${err.message}`, { correlationId });
  }

  const isProd = process.env.NODE_ENV === 'production';
  res.status(status).json({
    error: isProd && status === 500 ? 'Internal Server Error' : err.message,
    correlationId,
    ...(!isProd && { stack: err.stack }),
  });
}
