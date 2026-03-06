import {
  adjustSchema,
  reserveSchema,
  orderActionSchema,
  getSkuSchema
} from '../validators/inventory.validator.js';

import {
  adjustStock,
  reserveStock,
  deductStock,
  releaseStock
} from '../services/inventory.service.js';

import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * GET STOCK BY SKU
 */
export const getStockBySkuController = async (req, res, next) => {
  try {
    const { sku } = getSkuSchema.parse(req.params);

    const stock = await prisma.stock.findUnique({
      where: { sku }
    });

    if (!stock) throw new NotFoundError('Stock not found');

    return res.status(200).json({
      success: true,
      data: {
        sku: stock.sku,
        totalQuantity: stock.quantity,
        reserved: stock.reserved,
        available: stock.quantity - stock.reserved
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN STOCK ADJUSTMENT (Idempotent)
 */
export const adjustStockController = async (req, res, next) => {
  try {
    // 🚀 Idempotency-Key Header Required
    const idempotencyKey = req.get('Idempotency-Key');

    if (!idempotencyKey) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_HEADER',
          message: 'Idempotency-Key header is required'
        }
      });
    }

    const parsed = adjustSchema.parse(req.body);

    const result = await adjustStock({
      ...parsed,
      eventId: idempotencyKey
    });

    if (result?.status === 'IGNORED') {
      return res.status(200).json({
        success: true,
        idempotent: true,
        data: result
      });
    }

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (err) {
    next(err);
  }
};

/**
 * RESERVE STOCK (Saga)
 */
export const reserveStockController = async (req, res, next) => {
  try {
    const parsed = reserveSchema.parse(req.body);
    const result = await reserveStock(parsed);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DEDUCT STOCK (Saga)
 */
export const deductStockController = async (req, res, next) => {
  try {
    const parsed = orderActionSchema.parse(req.body);
    const result = await deductStock(parsed);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * RELEASE STOCK (Saga)
 */
export const releaseStockController = async (req, res, next) => {
  try {
    const parsed = orderActionSchema.parse(req.body);
    const result = await releaseStock(parsed);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};