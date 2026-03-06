import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

// ── TLS enforcement ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const dbUrl  = process.env.DATABASE_URL || '';
  const hasSSL = dbUrl.includes('sslmode=require') || dbUrl.includes('sslmode=verify-full');
  if (!hasSSL) {
    throw new Error(
      'DATABASE_URL must include ?sslmode=require in production. ' +
      'Unencrypted database connections are not permitted.'
    );
  }
}

export const prisma = new PrismaClient({
  log: [
    { level: 'warn',  emit: 'event' },
    { level: 'error', emit: 'event' },
    ...(process.env.NODE_ENV === 'development'
      ? [{ level: 'query', emit: 'event' }]
      : []),
  ],
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

prisma.$on('warn',  (e) => logger.warn(`[Prisma] ${e.message}`));
prisma.$on('error', (e) => logger.error(`[Prisma] ${e.message}`));
prisma.$on('query', (e) => logger.debug(`[Prisma] ${e.query} (${e.duration}ms)`));

export async function connectDB() {
  await prisma.$connect();
  logger.info('PostgreSQL connected via Prisma');
}

export async function disconnectDB() {
  await prisma.$disconnect();
  logger.info('PostgreSQL disconnected');
}
