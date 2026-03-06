import { PrismaClient } from '@prisma/client';
import logger from '../src/utils/logger.js';

const prisma = new PrismaClient({
  log: [
    { level: 'warn',  emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

prisma.$on('warn',  (e) => logger.warn({ msg: 'Prisma warn',  message: e.message }));
prisma.$on('error', (e) => logger.error({ msg: 'Prisma error', message: e.message }));

export default prisma;
