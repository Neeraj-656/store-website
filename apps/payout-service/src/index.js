import 'dotenv/config';
import app from './app.js';
import config from './config/index.js';
import logger from './utils/logger.js';
import prisma from '../prisma/client.js';
import { startOutboxRelay, closeRabbitMQ } from './services/rabbitmq.service.js';
import { startConsumers } from './events/payout.consumer.js';
import { startEscrowReleaseWorker } from './workers/escrow-release.worker.js';

async function main() {
  // ── DB connectivity check ────────────────────────────────────────────────
  await prisma.$connect();
  logger.info('PostgreSQL connected');

  // ── Start background workers ─────────────────────────────────────────────
  startOutboxRelay();
  startEscrowReleaseWorker();

  // ── Start RabbitMQ consumers ─────────────────────────────────────────────
  await startConsumers();

  // ── HTTP server ──────────────────────────────────────────────────────────
  const server = app.listen(config.port, () => {
    logger.info({ msg: `Payout Service listening`, port: config.port, env: config.nodeEnv });
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info({ msg: `Shutdown signal received`, signal });
    server.close(async () => {
      await closeRabbitMQ();
      await prisma.$disconnect();
      logger.info('Payout Service shut down cleanly');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ msg: 'Failed to start Payout Service', err });
  process.exit(1);
});
