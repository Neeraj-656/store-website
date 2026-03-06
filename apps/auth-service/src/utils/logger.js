import pino from 'pino';
import config from '../config/index.js';

const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  ...(config.nodeEnv !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
  // Redact sensitive fields from all log output
  redact: {
    paths: ['*.password', '*.passwordHash', '*.token', '*.refreshToken', '*.code'],
    censor: '[REDACTED]',
  },
});

export default logger;
