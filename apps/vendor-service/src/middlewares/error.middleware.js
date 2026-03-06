import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export function errorHandler(err, req, res, _next) {
  // Custom AppError hierarchy
  if (err instanceof AppError) {
    logger.warn({ msg: err.message, code: err.code, requestId: req.requestId });
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
      requestId: req.requestId,
    });
  }

  // ── Multer v2 error codes ───────────────────────────────────────────────

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'File exceeds the maximum allowed size' },
      requestId: req.requestId,
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      error: { code: 'TOO_MANY_FILES', message: 'Only one file may be uploaded at a time' },
      requestId: req.requestId,
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: { code: 'UNEXPECTED_FIELD', message: 'Unexpected file field — use the field name "file"' },
      requestId: req.requestId,
    });
  }

  // fileFilter rejection thrown by multer v2 fileFilter callback
  if (err instanceof Error && err.message.startsWith('Unsupported file type')) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_FILE_TYPE', message: err.message },
      requestId: req.requestId,
    });
  }

  // ── Fallback ────────────────────────────────────────────────────────────

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