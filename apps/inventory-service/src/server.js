import http from 'http';
import app from './app.js';

import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { rabbitMQ } from './lib/rabbitmq.js';
import { startInventoryConsumer } from './events/inventory.consumer.js';

const PORT = process.env.PORT || 3001;
const SHUTDOWN_TIMEOUT = 10000; // 10 seconds safety timeout

// Create HTTP server instance
const server = http.createServer(app);

/**
 * Graceful Shutdown Handler
 */
const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  const forceShutdown = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  try {
    // Stop accepting new HTTP requests
    server.close(async () => {
      logger.info('HTTP server closed');

      // Disconnect DB
      await prisma.$disconnect();
      logger.info('Database disconnected');

      // Close RabbitMQ connection
      if (rabbitMQ?.connection) {
        await rabbitMQ.connection.close();
        logger.info('RabbitMQ connection closed');
      }

      clearTimeout(forceShutdown);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

  } catch (err) {
    logger.fatal(err, 'Error during shutdown');
    process.exit(1);
  }
};

/**
 * Bootstrap Application
 */
const start = async () => {
  try {
    logger.info('Bootstrapping Inventory Service...');

    // 1️⃣ Connect to RabbitMQ FIRST
    await rabbitMQ.connect();
    logger.info('Connected to RabbitMQ');

    // 2️⃣ Start Inventory Consumer
    await startInventoryConsumer();
    logger.info('Inventory consumer started');

    // 3️⃣ Warm up Database
    await prisma.$connect();
    logger.info('Database connected');

    // 4️⃣ Start HTTP Server LAST
    server.listen(PORT, () => {
      logger.info(`🚀 Inventory Service running on port ${PORT}`);
    });

  } catch (err) {
    logger.fatal(err, 'Failed to bootstrap Inventory Service');
    process.exit(1);
  }
};

// Start service
start();

// Graceful shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));