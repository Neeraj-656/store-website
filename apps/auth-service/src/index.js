import 'dotenv/config';
import app     from './app.js';
import config  from './config/index.js';
import logger  from './utils/logger.js';
import prisma  from '../prisma/client.js';
import { startOutboxRelay, closeRabbitMQ } from './services/rabbitmq.service.js';
import { startConsumers }  from './events/admin.consumer.js';
import { startTokenCleanupWorker } from './workers/token-cleanup.worker.js';

async function main() {
  // ── DB ───────────────────────────────────────────────────────────────────
  await prisma.$connect();
  logger.info('PostgreSQL connected');

  // ── Workers ───────────────────────────────────────────────────────────────
  startOutboxRelay();
  startTokenCleanupWorker();

  // ── Consumers ─────────────────────────────────────────────────────────────
  try {
    await startConsumers();
  } catch (err) {
    // Non-fatal in dev — services start before RabbitMQ is ready
    logger.warn({ msg: 'RabbitMQ consumers failed to start (non-fatal in dev)', err: err.message });
  }

  // ── HTTP Server ───────────────────────────────────────────────────────────
  const server = app.listen(config.port, () => {
    logger.info({
      msg:  'Auth Service listening',
      port: config.port,
      env:  config.nodeEnv,
    });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info({ msg: 'Shutdown signal received', signal });
    server.close(async () => {
      await closeRabbitMQ();
      await prisma.$disconnect();
      logger.info('Auth Service shut down cleanly');
      process.exit(0);
    });
    // Force-kill if graceful shutdown takes too long
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ msg: 'Failed to start Auth Service', err });
  process.exit(1);
});
