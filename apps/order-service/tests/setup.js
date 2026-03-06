// Global test setup — mock all infrastructure dependencies.
//
// With "type":"module" and Jest's --experimental-vm-modules mode,
// jest.unstable_mockModule() is the correct API for hoisted ESM mocks.
// jest.mock() is CJS-only and does NOT work with native ESM.

import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/config/prisma.js', () => ({
  prisma: {
    order: {
      create:     jest.fn(),
      findUnique: jest.fn(),
      findMany:   jest.fn(),
      update:     jest.fn(),
      count:      jest.fn(),
    },
    orderStatusHistory: { create: jest.fn() },
    outboxEvent: {
      create:     jest.fn(),
      findMany:   jest.fn(),
      update:     jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn({
      order:              { create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
      outboxEvent:        { create: jest.fn() },
    })),
    $queryRaw:   jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $connect:    jest.fn(),
    $disconnect: jest.fn(),
  },
  connectDB:    jest.fn(),
  disconnectDB: jest.fn(),
}));

jest.unstable_mockModule('../src/config/rabbitmq.js', () => ({
  connectRabbitMQ: jest.fn(),
  closeRabbitMQ:   jest.fn(),
  getChannel: jest.fn(() => ({
    publish:  jest.fn().mockReturnValue(true),
    consume:  jest.fn(),
    ack:      jest.fn(),
    nack:     jest.fn(),
    prefetch: jest.fn(),
  })),
  isConnected:  jest.fn(() => true),
  EXCHANGE:     'grocery.events',
  DLX:          'grocery.dlx',
  ROUTING_KEYS: {
    ORDER_CREATED:               'order.created',
    ORDER_CONFIRMED:             'order.confirmed',
    ORDER_SHIPPED:               'order.shipped',
    ORDER_CANCELLED:             'order.cancelled',
    ORDER_DELIVERED:             'order.delivered',
    CHECKOUT_INITIATED:          'order.checkout.initiated',
    INVENTORY_RELEASE_REQUESTED: 'inventory.release.requested',
  },
  QUEUES: {
    ORDER_EVENTS:          'order.events',
    PAYMENT_EVENTS:        'payment.events',
    INVENTORY_EVENTS:      'inventory.events',
    ORDER_CHECKOUT_EVENTS: 'order.checkout.events',
  },
  MAX_RETRIES: 3,
}));

jest.unstable_mockModule('../src/config/redis.js', () => ({
  getRedisClient: jest.fn(() => ({
    ping: jest.fn().mockResolvedValue('PONG'),
    call: jest.fn(),
    quit: jest.fn(),
  })),
  connectRedis:    jest.fn(),
  disconnectRedis: jest.fn(),
}));
