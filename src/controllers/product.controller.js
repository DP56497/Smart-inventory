const productService = require('../services/product.service');
const {
  createProductSchema,
  updateProductSchema,
  productQuerySchema
} = require('../validators/product.validation');
const { sendSuccess } = require('../utils/response');

class ProductController {
  /**
   * GET /api/products
   */
  async getProducts(req, res, next) {
    try {
      const validatedQuery = productQuerySchema.parse(req.query);
      const { products, meta } = await productService.getProducts(req.organizationId, validatedQuery);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Products retrieved successfully',
        data: { products },
        meta
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/products/:id
   */
  async getProductById(req, res, next) {
    try {
      const product = await productService.getProductById(req.organizationId, req.params.id);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Product retrieved successfully',
        data: { product }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/products
   */
  async createProduct(req, res, next) {
    try {
      const validatedData = createProductSchema.parse(req.body);
      const product = await productService.createProduct(req.organizationId, req.user.id, validatedData);

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Product created successfully',
        data: { product }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/products/:id
   */
  async updateProduct(req, res, next) {
    try {
      const validatedData = updateProductSchema.parse(req.body);
      const product = await productService.updateProduct(
        req.organizationId,
        req.params.id,
        req.user.id,
        validatedData
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Product updated successfully',
        data: { product }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/products/:id
   */
  async deleteProduct(req, res, next) {
    try {
      const result = await productService.deleteProduct(req.organizationId, req.params.id);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Product deleted successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProductController();
