import logger from '../utils/logger.js';

/**
 * Logs every inbound request and its final response status/duration.
 */
export function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info';

    logger[level]({
      method:        req.method,
      path:          req.path,
      status:        res.statusCode,
      durationMs:    ms,
      correlationId: req.correlationId,
      userId:        req.headers['x-user-id'] || undefined,
    });
  });

  next();
}
