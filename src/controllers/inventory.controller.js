const inventoryService = require('../services/inventory.service');
const {
  stockAdjustmentSchema,
  inventoryQuerySchema,
  movementQuerySchema
} = require('../validators/inventory.validation');
const { sendSuccess } = require('../utils/response');

class InventoryController {
  /**
   * GET /api/inventory
   */
  async getInventory(req, res, next) {
    try {
      const validatedQuery = inventoryQuerySchema.parse(req.query);
      const { products, summary, meta } = await inventoryService.getInventory(
        req.organizationId,
        validatedQuery
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Inventory retrieved successfully',
        data: { products, summary },
        meta
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventory/movements
   */
  async getMovements(req, res, next) {
    try {
      const validatedQuery = movementQuerySchema.parse(req.query);
      const { movements, meta } = await inventoryService.getStockMovements(
        req.organizationId,
        validatedQuery
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Stock movements retrieved successfully',
        data: { movements },
        meta
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/inventory/adjustment
   */
  async createAdjustment(req, res, next) {
    try {
      const validatedData = stockAdjustmentSchema.parse(req.body);
      const result = await inventoryService.adjustStock(
        req.organizationId,
        req.user.id,
        validatedData
      );

      return sendSuccess(res, {
        statusCode: 201,
        message: `Stock adjusted successfully (${validatedData.type})`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventory/low-stock
   */
  async getLowStock(req, res, next) {
    try {
      const validatedQuery = inventoryQuerySchema.parse(req.query);
      const { products, summary, meta } = await inventoryService.getLowStock(
        req.organizationId,
        validatedQuery
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Low stock items retrieved successfully',
        data: { products, summary },
        meta
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventory/out-of-stock
   */
  async getOutOfStock(req, res, next) {
    try {
      const validatedQuery = inventoryQuerySchema.parse(req.query);
      const { products, summary, meta } = await inventoryService.getOutOfStock(
        req.organizationId,
        validatedQuery
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Out of stock items retrieved successfully',
        data: { products, summary },
        meta
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/inventory/:productId
   */
  async getProductInventory(req, res, next) {
    try {
      const productInventory = await inventoryService.getProductInventory(
        req.organizationId,
        req.params.productId
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Product inventory details retrieved successfully',
        data: { product: productInventory }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InventoryController();
