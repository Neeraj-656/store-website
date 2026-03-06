import { ValidationError } from '../utils/errors.js';

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const data = source === 'query' ? req.query : req.body;
    const result = schema.safeParse(data);

    if (!result.success) {
      const message = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      return next(new ValidationError(message));
    }

    if (source === 'query') {
      req.query = result.data;
    } else {
      req.body = result.data;
    }

    next();
  };
}
