import { productService } from '../services/product.service.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * @typedef {import('express').Request & { vendorId: string }} AuthenticatedRequest
 * @typedef {import('express').Response} ExpressResponse
 * @typedef {import('express').NextFunction} NextFunction
 */

export const productController = {
  
  // --- WRITE OPERATIONS ---

  /**
   * @param {AuthenticatedRequest} req 
   * @param {ExpressResponse} res 
   * @param {NextFunction} next 
   */
  async createProduct(req, res, next) {
    try {
      // 🚀 1. Extract Idempotency Key from headers
      const idempotencyKey = req.headers['x-idempotency-key'];

      const product = await productService.createProduct(
        req.vendorId, 
        req.body, 
        idempotencyKey
      );

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product
      });
    } catch (error) {
      next(error); 
    }
  },

  /**
   * @param {AuthenticatedRequest} req 
   * @param {ExpressResponse} res 
   * @param {NextFunction} next 
   */
  async changeStatus(req, res, next) {
    try {
      const { id: productId } = req.params;
      // 🚀 2. Extract reason for the Audit Trail
      const { status, expectedVersion, reason } = req.body; 
      
      // The actor making the change
      const changedBy = req.vendorId; 

      const updatedProduct = await productService.changeProductStatus(
        productId, 
        req.vendorId, 
        expectedVersion, 
        status,
        changedBy,
        reason
      );

      res.status(200).json({ 
        success: true,
        message: 'Product status updated', 
        data: updatedProduct 
      });
    } catch (error) {
      next(error);
    }
  },

  // --- READ OPERATIONS ---

  /**
   * @param {import('express').Request} req 
   * @param {ExpressResponse} res 
   * @param {NextFunction} next 
   */
  async getPublicProduct(req, res, next) {
    try {
      const { id: productId } = req.params;
      
      const product = await productService.getPublicProduct(productId);
      
      // 🚀 3. Handle the null return for non-ACTIVE products
      if (!product) {
        throw new NotFoundError("Product not found or currently inactive.");
      }
      
      res.status(200).json({ 
        success: true,
        data: product 
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * @param {AuthenticatedRequest} req 
   * @param {ExpressResponse} res 
   * @param {NextFunction} next 
   */
  async getVendorProduct(req, res, next) {
    try {
      const { id: productId } = req.params;

      const product = await productService.getVendorProduct(productId, req.vendorId);
      
      res.status(200).json({ 
        success: true,
        data: product 
      });
    } catch (error) {
      next(error);
    }
  }
};