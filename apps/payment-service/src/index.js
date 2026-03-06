import 'dotenv/config';
import app from './app.js';
import config from './config/index.js';
import logger from './utils/logger.js';
import prisma from '../prisma/client.js';
import { startOutboxRelay, closeRabbitMQ } from './services/rabbitmq.service.js';


let shuttingDown = false;

async function main() {
  // ── Verify DB connection ──────────────────────────────────────────────────
  await prisma.$connect();
  logger.info('Database connected');

  // ── Start outbox relay worker ────────────────────────────────────────────
  startOutboxRelay();

  // ── Start HTTP server ────────────────────────────────────────────────────
  const server = app.listen(config.port, () => {
    logger.info({ msg: 'Payment Service listening', port: config.port, env: config.nodeEnv });
  });

  // ── Graceful Shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ msg: `${signal} received — shutting down gracefully` });

    server.close(async () => {
      try {
        await closeRabbitMQ();
        await prisma.$disconnect();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error({ msg: 'Error during shutdown', err });
        process.exit(1);
      }
    });

    // Suicide timer — force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ msg: 'Unhandled promise rejection', reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error({ msg: 'Uncaught exception', err });
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error({ msg: 'Fatal startup error', err });
  process.exit(1);
});

