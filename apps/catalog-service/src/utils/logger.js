import pino from 'pino';

/**
 * Enterprise Logger Configuration
 * - Production: Outputs structured JSON for ELK/Datadog/CloudWatch.
 * - Development: Outputs colorized, human-readable logs via pino-pretty.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      } 
    : undefined,
  // Add global metadata to all logs for easier tracing
  base: {
    service: 'catalog-service',
    env: process.env.NODE_ENV || 'development'
  }
});