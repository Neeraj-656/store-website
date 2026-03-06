import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { NotFoundError, ConflictError, BusinessRuleError } from '../utils/errors.js';

/**
 * 🔒 BUSINESS RULE: The Product Status State Machine
 * Enforced inside the DB transaction to completely eliminate TOCTOU race conditions.
 */
const VALID_STATUS_TRANSITIONS = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['DRAFT', 'ARCHIVED', 'SUSPENDED'],
  SUSPENDED: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
  ARCHIVED: [] // Terminal state
};

export const productRepository = {
  
  /**
   * ATOMIC & IDEMPOTENT: Creates a product and queues a minimal event payload.
   * Relies on the DB constraint (vendorId, idempotencyKey) to safely handle concurrent retries.
   */
  async createWithVariants(vendorId, data, idempotencyKey) {
    try {
      return await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            vendorId,
            idempotencyKey, // Allows Postgres to enforce exactly-once creation
            categoryId: data.categoryId,
            name: data.name,
            description: data.description,
            status: 'DRAFT',
            variants: { create: data.variants },
            images: { create: data.images }
          },
          include: { variants: true }
        });

        // Aggressive ECST Shrink: Only essential identity fields are published
        await tx.outboxEvent.create({
          data: {
            aggregateId: product.id,
            type: 'catalog.product.created',
            payload: {
              productId: product.id,
              vendorId: product.vendorId,
              variants: product.variants.map(v => ({ id: v.id, sku: v.sku }))
            }
          }
        });

        return product;
      });
    } catch (error) {
      // 🚀 The Enterprise Fix: Catch the race condition at the DB constraint level
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        if (idempotencyKey) {
          const existingProduct = await prisma.product.findUnique({
            where: { vendorId_idempotencyKey: { vendorId, idempotencyKey } },
            include: { variants: true }
          });
          if (existingProduct) return existingProduct;
        }
      }
      throw error;
    }
  },

  /**
   * ATOMIC: Validates state machine, updates status, writes audit log, and queues event.
   */
  async updateStatus(productId, vendorId, expectedVersion, newStatus, changedBy, reason) {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch locked current state using the optimized compound index
      const existing = await tx.product.findUnique({
        where: { id_vendorId: { id: productId, vendorId } } 
      });

      if (!existing || existing.deletedAt !== null) {
        throw new NotFoundError("Product not found or soft-deleted.");
      }

      // 2. ZERO-TOCTOU STATE MACHINE VALIDATION
      const allowedTransitions = VALID_STATUS_TRANSITIONS[existing.status];
      if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
        throw new BusinessRuleError(
          `Invalid transition: Cannot move from ${existing.status} to ${newStatus}.`
        );
      }

      // 3. The Atomic Guard (Optimistic Locking & Soft-Delete Check)
      // updateMany ensures the row cannot be soft-deleted milliseconds before this update executes.
      const updated = await tx.product.updateMany({
        where: { 
          id: productId, 
          version: expectedVersion, 
          deletedAt: null 
        },
        data: {
          status: newStatus,
          version: { increment: 1 }
        }
      });

      if (updated.count === 0) {
        throw new ConflictError("Optimistic lock failure: Resource modified, deleted, or version mismatch.");
      }

      // 4. Write Immutable Audit Trail
      await tx.productAudit.create({
        data: {
          productId,
          vendorId,
          changedBy,
          oldStatus: existing.status,
          newStatus,
          reason
        }
      });

      // 5. Queue Outbox Event with Audit Metadata
      await tx.outboxEvent.create({
        data: {
          aggregateId: productId,
          type: 'catalog.product.status_changed',
          payload: {
            productId,
            vendorId,
            oldStatus: existing.status,
            newStatus,
            changedBy, 
            reason
          }
        }
      });

      // Construct the known new state since updateMany does not return the row
      return { ...existing, status: newStatus, version: existing.version + 1 };
    });
  },

  /**
   * Multi-tenant Read: Strictly scoped by vendorId via compound index.
   */
  async findForVendor(productId, vendorId) {
    const product = await prisma.product.findUnique({
      where: { id_vendorId: { id: productId, vendorId } },
      include: { variants: true, images: true }
    });

    if (!product || product.deletedAt !== null) {
      throw new NotFoundError("Product not found or access denied.");
    }

    return product;
  },

  /**
   * Public Storefront Read: Unique PK fetch + secondary validation.
   */
  async findPublicById(productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true, images: true }
    });

    if (!product || product.status !== 'ACTIVE' || product.deletedAt !== null) {
      return null;
    }

    return product;
  }
};