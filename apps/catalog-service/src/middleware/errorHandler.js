import { AppError } from '../utils/errors.js';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

// Mocking a structured logger like Pino or Winston
const logger = {
  error: (logObj) => console.error(JSON.stringify(logObj))
};

export const errorHandler = (err, req, res, next) => {
  // 🚀 Structured JSON Logging for Datadog/ELK
  logger.error({
    event: 'unhandled_request_error',
    name: err.name,
    message: err.message,
    path: req.originalUrl,
    method: req.method,
    vendorId: req.vendorId || 'anonymous',
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  // 1. Domain App Errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.errorCode,
      message: err.message
    });
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_FAILED',
      details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
    });
  }

  // 3. Strict Prisma Engine Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ 
        success: false, 
        error: 'CONFLICT', 
        message: 'A unique constraint was violated (e.g., duplicate SKU).' 
      });
    }
    // Note: P2025 is intentionally omitted here because our Service/Repo layers 
    // catch it and wrap it in explicit NotFoundError or ConflictError.
  }

  // 4. Fallback Server Error
  return res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred.' 
      : err.message
  });
};