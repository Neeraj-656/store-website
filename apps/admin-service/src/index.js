import 'dotenv/config';
import app    from './app.js';
import config from './config/index.js';
import logger from './utils/logger.js';
import prisma from '../prisma/client.js';
import {
  startOutboxRelay,
  startOutboxSweeper,
  closeRabbitMQ,
} from './services/rabbitmq.service.js';
import { startConsumers } from './events/admin.consumer.js';

async function main() {
  await prisma.$connect();
  logger.info('PostgreSQL connected');

  // Start the outbox relay (publishes unpublished events every 2 s)
  startOutboxRelay();

  // Start the outbox sweeper (purges stale published events + processed
  // message IDs on a 24-hour schedule). (Issue 2 fix)
  startOutboxSweeper();

  try {
    await startConsumers();
  } catch (err) {
    logger.warn({ msg: 'RabbitMQ consumers failed to start (non-fatal in dev)', err: err.message });
  }

  const server = app.listen(config.port, () => {
    logger.info({ msg: 'Admin Service listening', port: config.port, env: config.nodeEnv });
  });

  const shutdown = async (signal) => {
    logger.info({ msg: 'Shutdown signal', signal });
    server.close(async () => {
      await closeRabbitMQ();
      await prisma.$disconnect();
      logger.info('Admin Service shut down cleanly');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ msg: 'Failed to start Admin Service', err });
  process.exit(1);
});
