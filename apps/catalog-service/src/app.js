import express from 'express';
import productRoutes from './routes/product.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rabbitmq } from './events/rabbitmq.js';
import { startOutboxRelay, stopOutboxRelay } from './events/outbox.event.js';
import { prisma } from './lib/prisma.js'; // Adjust path if needed


const app = express();

// 1. Standard Middleware
app.use(express.json());

// 2. Kubernetes Probes
// 🟢 LIVENESS: Is the Node process running? (Always 200 unless deadlocked)
app.get('/live', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

// 🟡 READINESS: Can this pod handle traffic right now? (Checks dependencies)
app.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    const channel = rabbitmq.getChannel();
    if (!channel) throw new Error("Broker channel unavailable");

    res.status(200).json({ status: 'READY', db: 'UP', broker: 'UP' });
  } catch (error) {
    // K8s removes pod from routing, but DOES NOT kill the pod
    res.status(503).json({ status: 'UNREADY', error: error.message });
  }
});

// 3. Mount Routes & Error Handling
app.use('/api/v1/products', productRoutes);
app.use(errorHandler);

// 4. Boot Sequence
const PORT = process.env.PORT || 3001;
let server;

const startServer = async () => {
  try {
    // A. Connect to Broker first
    await rabbitmq.connect();
    console.log('✅ RabbitMQ initialized');

    // B. Start Background Worker
    startOutboxRelay();
    console.log('✅ Outbox Worker polling started');

    // C. Accept HTTP Traffic
    server = app.listen(PORT, () => {
      console.log(`🚀 Catalog Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Fatal error during startup:', error);
    process.exit(1);
  }
};

// 5. Deterministic Graceful Shutdown
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Initiating deterministic shutdown...`);

  try {
    // A. Stop HTTP Server (Wait for in-flight requests to finish)
    if (server) {
      await new Promise((resolve) => {
        server.close((err) => {
          if (err) console.error('⚠️ Error closing HTTP server:', err);
          console.log('✅ HTTP server closed. No new traffic.');
          resolve();
        });
      });
    }

    // B. Safely Drain Outbox Worker (Wait for current batch to finish)
    if (typeof stopOutboxRelay === 'function') {
      await stopOutboxRelay();
      console.log('✅ Outbox Worker drained and stopped.');
    }

    // C. Safely Drain RabbitMQ (Wait for publisher confirms)
    await rabbitmq.close();
    console.log('✅ RabbitMQ connections drained and closed.');

    // D. Disconnect DB
    await prisma.$disconnect();
    console.log('✅ Prisma disconnected safely.');

    console.log('👋 Shutdown complete. Event loop will now exit naturally.');
    // Node exits naturally when the event loop is empty. No process.exit(0).

  } catch (error) {
    console.error('🚨 Error during graceful shutdown:', error);
    process.exit(1); // Only force exit on a fatal teardown failure
  }
};


process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();