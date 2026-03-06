import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma Client
 * Ensures we only have one connection pool for the entire application.
 */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Soft-shutdown hook to close the connection if the process is killed
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});