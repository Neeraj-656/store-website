import { v4 as uuidv4 } from 'uuid';

/**
 * Assigns a unique correlation/trace ID to every request.
 * Respects an inbound x-correlation-id (from a client or upstream proxy)
 * so the same ID flows across all services.
 */
export function correlationId(req, res, next) {
  const id = req.headers['x-correlation-id'] ?? uuidv4();
  req.correlationId              = id;
  req.headers['x-correlation-id'] = id;
  res.setHeader('x-correlation-id', id);
  next();
}
