import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { VersionConflictError, BusinessRuleError } from '../utils/errors.js';

class TTLSweeperWorker {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.pollInterval = 60000; 
    this.workerId = crypto.randomUUID(); // Unique to this process instance
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info({ workerId: this.workerId }, 'Started Production-Grade TTL Sweeper');
    this.intervalId = setInterval(() => this.sweepExpiredLocks(), this.pollInterval);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
    logger.info('Stopped TTL Sweeper Worker');
  }

  async sweepExpiredLocks() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      // 🚀 FIX #2: Zombie Lock Crash Recovery (5 minute timeout)
      const crashThreshold = new Date(now.getTime() - 5 * 60000); 

      // STEP 1: Identify Candidates
      const candidates = await prisma.reservationLock.findMany({
        where: {
          OR: [
            { status: 'ACTIVE', expiresAt: { lte: now } },
            { status: 'PROCESSING', processingStartedAt: { lte: crashThreshold } }
          ]
        },
        take: 50
      });

      if (!candidates.length) return;

      const candidateIds = candidates.map(c => c.id);

      // STEP 2: Atomic Claim Execution
      // 🚀 FIX #1: Strict WHERE clause and workerId tagging
      await prisma.reservationLock.updateMany({
        where: {
          id: { in: candidateIds },
          OR: [
            { status: 'ACTIVE' },
            { status: 'PROCESSING', processingStartedAt: { lte: crashThreshold } }
          ]
        },
        data: { 
          status: 'PROCESSING', 
          processingStartedAt: now,
          workerId: this.workerId 
        }
      });

      // STEP 3: Fetch ONLY the locks this specific worker successfully tagged
      const claimedLocks = await prisma.reservationLock.findMany({
        where: { workerId: this.workerId, status: 'PROCESSING' }
      });

      if (claimedLocks.length === 0) return;

      logger.info({ count: claimedLocks.length }, 'Successfully claimed expired reservations');

      for (const lock of claimedLocks) {
        let attempt = 0;
        let success = false;

        while (attempt < 3 && !success) {
          attempt++;
          try {
            await prisma.$transaction(async (tx) => {
              const stock = await tx.stock.findUnique({ where: { sku: lock.sku } });
              if (!stock) return;

              // 🚀 FIX #4: Fail loudly on invariant violation
              if (stock.reserved < lock.quantity) {
                throw new BusinessRuleError(
                  `Reservation invariant violated: Cannot release ${lock.quantity} from reserved pool of ${stock.reserved}`
                );
              }

              const newReserved = stock.reserved - lock.quantity;
              
              const updated = await tx.stock.updateMany({
                where: { sku: lock.sku, version: stock.version },
                data: { reserved: newReserved, version: { increment: 1 } }
              });

              if (updated.count === 0) throw new VersionConflictError();

              await tx.reservationLock.delete({ where: { id: lock.id } });

              // 🚀 FIX #3: Accurate, split audit logging
              await tx.stockHistory.create({
                data: { 
                  sku: lock.sku, 
                  change: -lock.quantity, 
                  reason: 'TTL_EXPIRED', 
                  source: 'system-sweeper', 
                  quantityAfter: stock.quantity, // Total quantity remains unchanged
                  reservedAfter: newReserved     // Accurate new reserved state
                }
              });

              await tx.outboxEvent.create({
                data: {
                  type: 'inventory.reservation_expired',
                  payload: { orderId: lock.orderId, sku: lock.sku, reason: 'TTL Timeout' }
                }
              });
            });

            success = true;
            logger.info({ orderId: lock.orderId, sku: lock.sku }, 'Expired reservation reclaimed');
            
          } catch (err) {
            if (err instanceof VersionConflictError && attempt < 3) continue;
            
            logger.error({ orderId: lock.orderId, err: err.message }, 'Failed to reclaim reservation');
            
            // Revert the claim so another worker (or this one later) can retry
            await prisma.reservationLock.update({
              where: { id: lock.id },
              data: { status: 'ACTIVE', workerId: null, processingStartedAt: null }
            }).catch(e => logger.error(e, 'Failed to release lock claim'));
            
            break; 
          }
        }
      }
    } catch (err) {
      logger.error(err, 'TTL Sweeper critical failure');
    } finally {
      this.isProcessing = false;
    }
  }
}

export const ttlSweeper = new TTLSweeperWorker();