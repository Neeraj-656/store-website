import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma Client with standard logging
 */
const prismaClientPropertyName = 'prisma';

if (!globalThis[prismaClientPropertyName]) {
  globalThis[prismaClientPropertyName] = new PrismaClient({
    // Logs help us debug slow inventory math in dev
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });
}

const prisma = globalThis[prismaClientPropertyName];

export { prisma };