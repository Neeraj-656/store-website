import pino from 'pino';
import config from '../config/index.js';

const logger = pino({
  level: config.isProd ? 'info' : 'debug',
  transport: config.isProd
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true } },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-internal-service-token"]',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

export default logger;