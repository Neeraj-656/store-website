// Prisma v7 — driver adapter required
// Import from the generated output path (matches schema.prisma `output` field)
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import logger from '../src/utils/logger.js';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
  max: 10,
  idleTimeoutMillis: 30_000,
});

const prisma = new PrismaClient({
  adapter,
  log: [{ emit: 'event', level: 'error' }],
});

prisma.$on('error', (e) => {
  logger.error({ msg: 'Prisma error', ...e });
});

export default prisma;