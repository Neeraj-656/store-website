import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    logger.warn({ msg: err.message, code: err.code, requestId: req.requestId });
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code ?? 'ERROR', message: err.message },
      requestId: req.requestId,
    });
  }

  logger.error({ msg: 'Unhandled error', err, requestId: req.requestId });
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' },
    requestId: req.requestId,
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
}