import 'dotenv/config';
import app from './src/app.js';
import { connectDB, disconnectDB }        from './src/config/prisma.js';
import { connectRabbitMQ, closeRabbitMQ } from './src/config/rabbitmq.js';
import { connectRedis, disconnectRedis }  from './src/config/redis.js';
import { startConsumers }                 from './src/events/consumers.js';
import { startOutboxProcessor, stopOutboxProcessor } from './src/events/outboxProcessor.js';
import logger from './src/config/logger.js';

const PORT = process.env.PORT || 3003;
let server;

async function bootstrap() {
  await connectDB();
  await connectRedis();
  await connectRabbitMQ();
  await startConsumers();
  startOutboxProcessor();

  server = app.listen(PORT, () => {
    logger.info(`Order Service running on port ${PORT}`);
  });
}

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);

  stopOutboxProcessor();

  await new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  logger.info('HTTP server closed');

  await closeRabbitMQ();
  await disconnectRedis();
  await disconnectDB();

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection').catch(() => process.exit(1));
});

bootstrap().catch((err) => {
  logger.error('Bootstrap failed:', err);
  process.exit(1);
});
