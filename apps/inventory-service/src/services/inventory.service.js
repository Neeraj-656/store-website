import { prisma } from '../lib/prisma.js';
import { NotFoundError, BusinessRuleError, VersionConflictError } from '../utils/errors.js';

const MAX_RETRIES = 3;

/**
 * Executes a database transaction with an Optimistic Locking retry loop.
 */
const executeWithRetry = async (operation) => {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      return await prisma.$transaction(operation);
    } catch (err) {
      if (err instanceof VersionConflictError && attempt < MAX_RETRIES) continue;
      // If Prisma throws a Unique Constraint violation on ProcessedEvent, 
      // it means a concurrent duplicate request beat us to the punch.
      if (err.code === 'P2002' && err.meta?.target?.includes('ProcessedEvent_pkey')) {
         return { status: 'IGNORED', reason: 'Concurrent duplicate event intercepted' };
      }
      throw err;
    }
  }
  throw new Error('Stock update failed due to persistent concurrent modifications');
};

// ==========================================
// READ: GET STOCK
// ==========================================
export const getStock = async (sku) => {
  const stock = await prisma.stock.findUnique({ where: { sku } });
  if (!stock) throw new NotFoundError(`Stock not found: ${sku}`);
  
  return {
    sku: stock.sku,
    totalQuantity: stock.quantity,
    reserved: stock.reserved,
    available: stock.quantity - stock.reserved
  };
};

// ==========================================
// ADMIN: MANUAL ADJUST STOCK
// ==========================================
export const adjustStock = async ({ eventId, sku, increment, reason, source }) => {
  return executeWithRetry(async (tx) => {
    // Idempotency check for Admin double-clicks
    const alreadyProcessed = await tx.processedEvent.findUnique({ where: { id: eventId } });
    if (alreadyProcessed) return { status: 'IGNORED', reason: 'Duplicate manual adjustment' };

    await tx.processedEvent.create({ data: { id: eventId } });

    const stock = await tx.stock.findUnique({ where: { sku } });
    if (!stock) throw new NotFoundError(`Stock not found: ${sku}`);

    const newQuantity = stock.quantity + increment;
    if (newQuantity < stock.reserved) {
      throw new BusinessRuleError('Cannot reduce total quantity below currently reserved amount');
    }

    const updated = await tx.stock.updateMany({
      where: { sku, version: stock.version },
      data: { quantity: newQuantity, version: { increment: 1 } }
    });

    if (updated.count === 0) throw new VersionConflictError();

    await tx.stockHistory.create({
      data: { 
        sku, 
        change: increment, 
        reason, 
        source, 
        quantityAfter: newQuantity,
        reservedAfter: stock.reserved
      }
    });

    return { sku, quantity: newQuantity, reserved: stock.reserved, status: 'SUCCESS' };
  });
};

// ==========================================
// SAGA: RESERVE STOCK (Before Payment)
// ==========================================
export const reserveStock = async ({ eventId, sku, orderId, quantity, expiresAt }) => {
  return executeWithRetry(async (tx) => {
    const alreadyProcessed = await tx.processedEvent.findUnique({ where: { id: eventId } });
    if (alreadyProcessed) return { status: 'IGNORED', reason: 'Duplicate event' };

    // Claim event early to force PK constraint on exact-millisecond race conditions
    await tx.processedEvent.create({ data: { id: eventId } });

    const stock = await tx.stock.findUnique({ where: { sku } });
    if (!stock) throw new NotFoundError(`Stock not found: ${sku}`);

    const available = stock.quantity - stock.reserved;

    // Saga Rejection Path
    if (available < quantity) {
      await tx.outboxEvent.create({
        data: {
          type: 'inventory.insufficient',
          payload: { orderId, sku, status: 'FAILED', reason: 'Insufficient available stock' }
        }
      });
      return { status: 'FAILED', reason: 'Insufficient available stock' };
    }

    // TTL Logic
    const expirationTime = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 15 * 60 * 1000);

    // Create the physical TTL lock
    await tx.reservationLock.create({
      data: { orderId, sku, quantity, expiresAt: expirationTime }
    });

    const newReserved = stock.reserved + quantity;

    const updated = await tx.stock.updateMany({
      where: { sku, version: stock.version },
      data: { reserved: newReserved, version: { increment: 1 } }
    });

    if (updated.count === 0) throw new VersionConflictError();

    await tx.stockHistory.create({
      data: { 
        sku, 
        change: quantity, 
        reason: 'RESERVE', 
        source: `order:${orderId}`, 
        quantityAfter: stock.quantity, // Total quantity remains unchanged
        reservedAfter: newReserved 
      }
    });

    await tx.outboxEvent.create({
      data: {
        type: 'inventory.reserved',
        payload: { orderId, sku, status: 'SUCCESS', expiresAt: expirationTime }
      }
    });

    return { sku, reserved: newReserved, status: 'SUCCESS', expiresAt: expirationTime };
  });
};

// ==========================================
// SAGA: DEDUCT STOCK (After Payment Confirmation)
// ==========================================
export const deductStock = async ({ eventId, sku, orderId, quantity }) => {
  return executeWithRetry(async (tx) => {
    const alreadyProcessed = await tx.processedEvent.findUnique({ where: { id: eventId } });
    if (alreadyProcessed) return { status: 'IGNORED' };

    await tx.processedEvent.create({ data: { id: eventId } });

    // Verify the lock still exists (Hasn't been swept by the TTL worker)
    const lock = await tx.reservationLock.findUnique({
      where: { orderId_sku: { orderId, sku } }
    });

    if (!lock) {
      throw new BusinessRuleError(`No active reservation found for Order ${orderId}. It may have expired.`);
    }

    if (lock.quantity !== quantity) {
      throw new BusinessRuleError(`Quantity mismatch. Reserved ${lock.quantity}, trying to deduct ${quantity}.`);
    }

    const stock = await tx.stock.findUnique({ where: { sku } });
    
    // Paranoia check against data corruption
    if (stock.quantity < quantity) {
      throw new BusinessRuleError(`Data corruption anomaly: Cannot deduct ${quantity}. Only ${stock.quantity} in total stock.`);
    }

    const newQuantity = stock.quantity - lock.quantity;
    const newReserved = stock.reserved - lock.quantity;

    // Consume the lock
    await tx.reservationLock.delete({
      where: { id: lock.id }
    });

    const updated = await tx.stock.updateMany({
      where: { sku, version: stock.version },
      data: { quantity: newQuantity, reserved: newReserved, version: { increment: 1 } }
    });

    if (updated.count === 0) throw new VersionConflictError();

    await tx.stockHistory.create({
      data: { 
        sku, 
        change: -lock.quantity, 
        reason: 'SALE', 
        source: `order:${orderId}`, 
        quantityAfter: newQuantity, 
        reservedAfter: newReserved 
      }
    });

    await tx.outboxEvent.create({
      data: {
        type: 'inventory.deducted',
        payload: { orderId, sku, status: 'SUCCESS' }
      }
    });

    return { sku, quantity: newQuantity, status: 'SUCCESS' };
  });
};

// ==========================================
// SAGA: RELEASE STOCK (Cancellation / Refund)
// ==========================================
export const releaseStock = async ({ eventId, sku, orderId, quantity }) => {
  return executeWithRetry(async (tx) => {
    const alreadyProcessed = await tx.processedEvent.findUnique({ where: { id: eventId } });
    if (alreadyProcessed) return { status: 'IGNORED' };

    await tx.processedEvent.create({ data: { id: eventId } });

    const lock = await tx.reservationLock.findUnique({
      where: { orderId_sku: { orderId, sku } }
    });

    if (!lock) {
      throw new BusinessRuleError(`No active reservation found for Order ${orderId}.`);
    }

    const stock = await tx.stock.findUnique({ where: { sku } });
    
    if (stock.reserved < lock.quantity) {
      throw new BusinessRuleError(`Cannot release ${lock.quantity}. Only ${stock.reserved} reserved.`);
    }

    const newReserved = stock.reserved - lock.quantity;

    // Destroy the lock
    await tx.reservationLock.delete({
      where: { id: lock.id }
    });

    const updated = await tx.stock.updateMany({
      where: { sku, version: stock.version },
      data: { reserved: newReserved, version: { increment: 1 } }
    });

    if (updated.count === 0) throw new VersionConflictError();

    await tx.stockHistory.create({
      data: { 
        sku, 
        change: -lock.quantity, 
        reason: 'RELEASE', 
        source: `order:${orderId}`, 
        quantityAfter: stock.quantity, 
        reservedAfter: newReserved 
      }
    });

    await tx.outboxEvent.create({
      data: {
        type: 'inventory.restored',
        payload: { orderId, sku, status: 'SUCCESS' }
      }
    });

    return { sku, reserved: newReserved, status: 'SUCCESS' };
  });
};