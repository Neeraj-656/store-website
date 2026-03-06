import { rabbitMQ } from '../lib/rabbitmq.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { z } from 'zod';

const EXCHANGE = 'marketplace_events';
const DLX = 'marketplace_events_dlx';
const QUEUE = 'inventory_product_created';
const DLQ = 'inventory_product_created_dlq';
const ROUTING_KEY = 'catalog.product.created';

const productCreatedSchema = z.object({
  eventId: z.string(),
  productId: z.string(),
  skus: z.array(z.string().min(1))
});

export const startInventoryConsumer = async () => {
  await rabbitMQ.registerConsumer(async (channel) => {

    // Ensure infrastructure exists
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(DLX, 'topic', { durable: true });

    await channel.assertQueue(QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX
      }
    });

    await channel.assertQueue(DLQ, { durable: true });

    await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
    await channel.bindQueue(DLQ, DLX, ROUTING_KEY);

    channel.consume(QUEUE, async (msg) => {
      if (!msg) return;

      const raw = msg.content.toString();
      const correlationId = msg.properties.correlationId;

      try {
        const parsed = productCreatedSchema.parse(JSON.parse(raw));

        logger.info(
          { eventId: parsed.eventId, correlationId },
          'Received catalog.product.created'
        );

        await prisma.$transaction(async (tx) => {

          // 1️⃣ Event-level idempotency guard
          await tx.processedEvent.create({
            data: { id: parsed.eventId }
          });

          // 2️⃣ Atomic upserts for all SKUs
          for (const sku of parsed.skus) {
            await tx.stock.upsert({
              where: { sku },
              update: {}, // idempotent
              create: {
                productId: parsed.productId,
                sku,
                quantity: 0,
                reserved: 0,
                version: 1
              }
            });
          }
        });

        channel.ack(msg);

        logger.info(
          { eventId: parsed.eventId },
          'Stock initialized successfully (atomic)'
        );

      } catch (err) {

        // Schema validation error → bad producer → do NOT retry
        if (err instanceof z.ZodError) {
          logger.error(
            { errors: err.errors, raw },
            'Invalid event schema'
          );

          channel.nack(msg, false, false);
          return;
        }

        // Duplicate event → safe to ACK
        if (err.code === 'P2002') {
          logger.warn(
            { raw },
            'Duplicate event detected, skipping'
          );

          channel.ack(msg);
          return;
        }

        // Transient DB error → retry once
        logger.error(
          { error: err.message },
          'Database error during stock initialization'
        );

        channel.nack(msg, false, true);
      }
    });

    logger.info('Inventory consumer registered');
  });
};