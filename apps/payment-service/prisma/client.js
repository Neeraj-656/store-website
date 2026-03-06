

import { PrismaClient } from '@prisma/client';
import logger from '../src/utils/logger.js';

const prisma = new PrismaClient({
  
  log: [{ emit: 'event', level: 'error' }],
});

prisma.$on('error', (e) => {
  logger.error({ msg: 'Prisma error', ...e });
});

export default prisma;