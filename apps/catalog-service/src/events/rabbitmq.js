import amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const EXCHANGE_NAME = process.env.RABBITMQ_EXCHANGE || 'marketplace_events';

let connection = null;
let channel = null;
let isConnecting = false;

// 🚀 1. The Intentional Shutdown Flag
let isShuttingDown = false;

export const rabbitmq = {
  async connect(retryCount = 0) {
    if (channel) return channel;
    if (isConnecting) return;
    
    // 🛡️ Prevent new connection attempts if the server is shutting down
    if (isShuttingDown) return;

    isConnecting = true;

    try {
      connection = await amqp.connect(`${RABBITMQ_URL}?heartbeat=60`);
      channel = await connection.createConfirmChannel();
      await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

      console.log('✅ RabbitMQ Connected (Confirm Channel Active)');
      isConnecting = false;

      connection.on('error', (err) => {
        // 🚀 2. Ignore errors if we are intentionally killing the process
        if (isShuttingDown) return;
        
        console.error('[RabbitMQ] Connection error:', err.message);
        this.handleReconnect();
      });

      connection.on('close', () => {
        // 🚀 3. Intercept the 'close' event during graceful shutdown
        if (isShuttingDown) {
          console.log('✅ RabbitMQ connections drained and closed.');
          return; // Stop here! Do not reconnect.
        }
        
        console.warn('[RabbitMQ] Connection closed. Attempting reconnect...');
        this.handleReconnect();
      });

      return channel;
    } catch (error) {
      isConnecting = false;
      
      // 🚀 4. Prevent exponential backoff loops during shutdown
      if (isShuttingDown) return;

      const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000);
      console.error(`❌ RabbitMQ Connection Failed. Retrying in ${delay}ms`);
      
      setTimeout(() => this.connect(retryCount + 1), delay);
    }
  },

  handleReconnect() {
    if (isShuttingDown) return; // Fail-safe
    
    channel = null;
    connection = null;
    this.connect();
  },

  getChannel() {
    // Only throw if strictly null, otherwise return the channel instance
    if (!channel) return null; 
    return channel;
  },

  getExchangeName() {
    return EXCHANGE_NAME;
  },

  /**
   * 🛡️ Safely drain all pending publisher ACKs before closing
   */
  async close() {
    // 🚀 5. Set the flag BEFORE closing anything
    isShuttingDown = true;

    try {
      if (channel) {
        console.log('⏳ Waiting for RabbitMQ publisher confirms...');
        await channel.waitForConfirms(); 
        await channel.close();
        channel = null; // Clean up memory
      }
      if (connection) {
        await connection.close();
        connection = null; // Clean up memory
      }
    } catch (err) {
      console.error('⚠️ Error closing RabbitMQ gracefully:', err.message);
    }
  }
};