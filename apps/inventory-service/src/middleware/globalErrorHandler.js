// src/middleware/globalErrorHandler.js
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export const globalErrorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // 🚀 FIX #1: Catch Zod validation errors and format them nicely
  if (err instanceof ZodError) {
    logger.warn({ path: req.originalUrl, errors: err.errors }, 'Validation Error');
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid request data',
        details: err.flatten().fieldErrors
      }
    });
  }

  if (err.isOperational) {
    logger.warn({ message: err.message, path: req.originalUrl }, 'Operational Error');
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.name, message: err.message }
    });
  }

  logger.fatal(
    { err, path: req.originalUrl, body: req.body }, 
    'Unhandled Programmer Error! Potential state corruption.'
  );

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' }
  });
};