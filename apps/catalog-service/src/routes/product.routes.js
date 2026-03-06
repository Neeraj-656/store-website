import { Router } from 'express';
import { z } from 'zod';
import { productController } from '../controllers/product.controller.js';
import { validateRequest } from '../middleware/validate.js';
import { 
  createProductSchema, 
  changeStatusSchema, 
  getProductSchema 
} from '../utils/product.schemas.js';

// --- TYPE DECLARATIONS ---
/**
 * @typedef {import('express').Request} ExpressRequest
 * @typedef {import('express').Response} ExpressResponses
 * @typedef {import('express').NextFunction} NextFunction
 * @typedef {ExpressRequest & { vendorId: string }} AuthenticatedRequest
 */

// --- SECURITY MIDDLEWARE ---

const vendorHeaderSchema = z.string().uuid("Invalid Vendor ID format");

/**
 * Middleware: Validates Gateway Header and normalizes edge cases.
 * SECURITY ASSUMPTION: This service runs inside a private VPC or Service Mesh (mTLS).
 * The API Gateway is the only entity capable of routing traffic to this internal port.
 * * @param {ExpressRequest} req 
 * @param {ExpressResponse} res 
 * @param {NextFunction} next 
 */
const requireVendorIdentity = (req, res, next) => {
  const rawHeader = req.headers['x-vendor-id'];
  
  // Guard against API Gateway duplicating headers into an array
  const headerVal = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  
  const parsed = vendorHeaderSchema.safeParse(headerVal);

  if (!parsed.success) {
    return res.status(401).json({ 
      error: 'UNAUTHORIZED: Invalid or Missing Vendor Identity' 
    });
  }

  // 🚀 Read-only runtime property injection (Pure JS hardening)
  // This guarantees that downstream controllers cannot accidentally overwrite req.vendorId
  Object.defineProperty(req, 'vendorId', {
    value: parsed.data,
    writable: false,
    enumerable: true,
    configurable: false
  });

  next();
};

// --- ROUTER INSTANCES ---

const router = Router();
const vendorRouter = Router();

// --- PUBLIC ROUTES ---

// e.g., GET /api/v1/products/public/123e4567-e89b-12d3-a456-426614174000
router.get('/public/:id', productController.getPublicProduct);

// --- VENDOR PROTECTED ROUTES ---

// 1. Enforce Vendor Identity strictly on the entire vendor sub-router
vendorRouter.use(requireVendorIdentity);

// 2. Map endpoints cleanly using route chaining
vendorRouter.route('/')
  .post(
    validateRequest(createProductSchema), 
    productController.createProduct
  );

vendorRouter.route('/:id')
  .get(
    validateRequest(getProductSchema), 
    productController.getVendorProduct
  );

// 3. Specific nested actions
vendorRouter.patch(
  '/:id/status', 
  validateRequest(changeStatusSchema), 
  productController.changeStatus
);

// --- MOUNT THE SUB-ROUTER ---

router.use('/vendor', vendorRouter);

export default router;