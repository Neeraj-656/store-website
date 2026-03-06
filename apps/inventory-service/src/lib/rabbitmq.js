import amqp from 'amqplib';
import { logger } from '../lib/logger.js';

const EXCHANGE = 'marketplace_events';

class RabbitMQManager {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.consumers = [];
    this.reconnectAttempts = 0;
    this.maxBackoff = 60000;
    
    // 🚀 NEW: Guard against parallel reconnect loops
    this.reconnectTimer = null;
  }

  async connect() {
    try {
      logger.info('Connecting to RabbitMQ...');
      this.connection = await amqp.connect(process.env.RABBITMQ_URL);

      this.connection.on('error', (err) => logger.error(err, 'RabbitMQ connection error'));
      
      this.connection.on('close', async () => {
        logger.warn('RabbitMQ connection closed');
        this.channel = null; 
        await this.scheduleReconnect();
      });

      this.reconnectAttempts = 0;
      await this.createChannel();
      logger.info('RabbitMQ connected successfully');
    } catch (err) {
      logger.error(err, 'RabbitMQ connection failed');
      await this.scheduleReconnect();
    }
  }

  async scheduleReconnect() {
    // 🚀 NEW: Prevent stacking multiple timeouts if 'close' fires repeatedly
    if (this.reconnectTimer) return; 

    this.reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), this.maxBackoff);
    logger.warn({ delay }, 'Reconnecting to RabbitMQ with backoff');
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null; // Clear guard before executing
      this.connect();
    }, delay);
  }

  async createChannel() {
    try {
      try { await this.channel?.close(); } catch (_) {}
      
      this.channel = await this.connection.createConfirmChannel();
      
      // 🚀 NEW: Listen for Channel-specific errors (e.g., protocol violations)
      this.channel.on('error', (err) => {
        logger.error(err, 'RabbitMQ channel error');
        this.channel = null; // Invalidate so publishEvent fails fast
      });

      this.channel.on('return', (msg) => {
        logger.error(
          { routingKey: msg.fields.routingKey, event: msg.content.toString() },
          'Message returned by broker - no queue bound'
        );
      });

      await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      await this.channel.prefetch(10);
      
      logger.info('RabbitMQ confirm channel created');
      
      for (const consumer of this.consumers) {
        await consumer(this.channel);
      }
    } catch (err) {
      logger.error(err, 'Failed to create RabbitMQ channel');
      this.channel = null;
      throw err;
    }
  }

  async registerConsumer(consumerFn) {
    this.consumers.push(consumerFn);
    if (this.channel) await consumerFn(this.channel);
  }

  async publishEvent(routingKey, data) {
    if (!this.channel) {
      // Rejecting instead of throwing is safer for async callers
      return Promise.reject(new Error('RabbitMQ channel is not ready to publish'));
    }

    const payload = Buffer.from(JSON.stringify(data));
    
    return new Promise((resolve, reject) => {
      this.channel.publish(
        EXCHANGE, 
        routingKey, 
        payload, 
        {
          persistent: true,
          mandatory: true,
          contentType: 'application/json',
          timestamp: Date.now()
        },
        (err) => {
          if (err) {
            logger.error({ routingKey, err }, 'Broker NACK - message rejected');
            return reject(err);
          }
          logger.debug({ routingKey }, 'Event confirmed by broker');
          resolve();
        }
      );
    });
  }

  async close() {
    logger.info('Closing RabbitMQ connection');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try { await this.channel?.close(); } catch (_) {}
    try { await this.connection?.close(); } catch (_) {}
    this.channel = null;
  }
}

export const rabbitMQ = new RabbitMQManager();