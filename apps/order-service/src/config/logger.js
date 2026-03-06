import { createLogger, format, transports } from 'winston';

const baseLogger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, correlationId, stack, ...meta }) => {
      const cid     = correlationId ? ` [cid:${correlationId}]` : '';
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      const base    = `[${timestamp}] ${level.toUpperCase()}${cid}: ${message}${metaStr}`;
      return stack ? `${base}\n${stack}` : base;
    })
  ),
  transports: [new transports.Console()],
});

baseLogger.child = function (correlationId) {
  return {
    debug: (msg, meta) => baseLogger.debug(msg, { correlationId, ...meta }),
    info:  (msg, meta) => baseLogger.info(msg,  { correlationId, ...meta }),
    warn:  (msg, meta) => baseLogger.warn(msg,  { correlationId, ...meta }),
    error: (msg, meta) => baseLogger.error(msg, { correlationId, ...meta }),
  };
};

export default baseLogger;
