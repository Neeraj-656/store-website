import 'dotenv/config';
import { createApp }    from './app.js';
import { loadPublicKey } from './middleware/auth.middleware.js';
import config            from './config/index.js';
import logger            from './utils/logger.js';

async function bootstrap() {
  // ── Load JWT public key before accepting traffic ───────────────────────────
  // The gateway cannot verify tokens without it; fail fast if unavailable.
  logger.info('Loading JWT public key from auth service…');
  await loadPublicKey();

  // ── Start HTTP server ──────────────────────────────────────────────────────
  const app    = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`🚀 API Gateway listening on port ${config.port} [${config.nodeEnv}]`);
    logger.info('Service routing table:');
    Object.entries(config.services).forEach(([name, url]) => {
      logger.info(`  /api/v1/${name.padEnd(10)} → ${url}`);
    });
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10 s if connections are still open
    setTimeout(() => {
      logger.error('Forced exit after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('Gateway startup failed:', err);
  process.exit(1);
});
