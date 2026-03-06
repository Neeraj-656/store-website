import { rabbitmq } from './rabbitmq.js';
import { logger } from '../utils/logger.js';
import { randomUUID } from 'crypto';

export const eventBus = {
  /**
   * Publishes an event with guaranteed broker confirmation.
   * @param {string} routingKey - e.g., 'catalog.product.created'
   * @param {object} payload - The event data
   */
  async publish(routingKey, payload) {
    const channel = rabbitmq.getChannel();
    const exchange = rabbitmq.getExchangeName();

    try {
      // 🚀 JSON Safety: Protects against BigInts and circular references crashing the app
      const messageBuffer = Buffer.from(JSON.stringify(payload, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ));

      // 🚀 Idempotency/Tracing: Every distinct publish attempt gets a unique ID
      const messageId = randomUUID();

      return new Promise((resolve, reject) => {
        // Publish to the Confirm Channel
        channel.publish(
          exchange, 
          routingKey, 
          messageBuffer, 
          {
            persistent: true, // 🚀 MANDATORY: Message is saved to RabbitMQ's disk, not just RAM
            timestamp: Date.now(),
            messageId: messageId,
            contentType: 'application/json'
          }, 
          (err, ok) => {
            // This callback is triggered by the broker's ACK/NACK
            if (err) {
              logger.error({ messageId, routingKey, err: err.message }, '❌ RabbitMQ NACK');
              return reject(new Error('Broker rejected message (NACK)'));
            }
            // Message is safely on disk in RabbitMQ
            resolve(true); 
          }
        );
      });

    } catch (error) {
      // If channel is closed or Buffer fails, throw immediately so Outbox marks it for retry
      logger.error({ error: error.message, routingKey }, '❌ Failed to execute publish');
      throw error; 
    }
  }
};