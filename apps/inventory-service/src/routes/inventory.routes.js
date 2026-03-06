import express from 'express';
import {
  getStockBySkuController,
  adjustStockController,
  reserveStockController,
  deductStockController,
  releaseStockController
} from '../controllers/inventory.controller.js';

import { requireAdmin, requireServiceAuth } from '../middleware/auth.middleware.js';
import { readLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * ==========================================
 * STATIC ROUTES (Must come before dynamic)
 * ==========================================
 */

// 🔐 Admin Manual Action
router.post('/adjust', requireAdmin, adjustStockController);

// 🔐 Internal Service Saga Actions
router.post('/reserve', requireServiceAuth, reserveStockController);
router.post('/deduct', requireServiceAuth, deductStockController);
router.post('/release', requireServiceAuth, releaseStockController);

/**
 * ==========================================
 * DYNAMIC ROUTES (Always last)
 * ==========================================
 */

// 🌍 Public Read (Rate Limited)
router.get('/:sku', readLimiter, getStockBySkuController);

export default router;