import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Metadata: Essential for filtering in centralized logging systems
  base: {
    service: 'inventory-service',
    env: process.env.NODE_ENV || 'development'
  },
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname', // Cleans up the console output
          },
        }
      : undefined
});