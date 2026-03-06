import { productRepository } from '../repositories/product.repository.js';

export const productService = {
  
  /**
   * Orchestrates the creation of a new product.
   * Passes the idempotencyKey down to the DB layer for race-condition-safe handling.
   */
  async createProduct(vendorId, productData, idempotencyKey) {
    return await productRepository.createWithVariants(
      vendorId, 
      productData, 
      idempotencyKey
    );
  },

  /**
   * Orchestrates the status update.
   * State validation and TOCTOU protection are fully encapsulated in the repository.
   */
  async changeProductStatus(productId, vendorId, expectedVersion, newStatus, changedBy, reason) {
    return await productRepository.updateStatus(
      productId, 
      vendorId, 
      expectedVersion, 
      newStatus, 
      changedBy, 
      reason
    );
  },

  /**
   * Retrieves a product for the vendor dashboard.
   */
  async getVendorProduct(productId, vendorId) {
    return await productRepository.findForVendor(productId, vendorId);
  },

  /**
   * Retrieves a product for the public-facing storefront.
   */
  async getPublicProduct(productId) {
    return await productRepository.findPublicById(productId);
  }
};