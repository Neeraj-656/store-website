import { ZodError } from 'zod';

/**
 * Generic Express middleware to validate request body, params, and query.
 * @template T
 * @param {import('zod').ZodSchema<T>} schema 
 */
export const validateRequest = (schema) => (req, res, next) => {
  try {
    // Validate all incoming data sources against the schema
    const validated = schema.parse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    // Reassign strictly validated and sanitized data back to the request
    req.body = validated.body;
    req.params = validated.params;
    req.query = validated.query;

    next();
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        details: error.errors.map(err => ({
          // Path will now clearly indicate if the failure was in body, query, or params
          path: err.path.join('.'), 
          message: err.message,
        })),
      });
    }

    // Pass unexpected internal errors down the chain
    return next(error);
  }
};