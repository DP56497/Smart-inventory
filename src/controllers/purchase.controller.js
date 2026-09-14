const purchaseService = require('../services/purchase.service');
const {
  createPurchaseSchema,
  updatePurchaseStatusSchema,
  purchaseQuerySchema
} = require('../validators/purchase.validation');
const { sendSuccess } = require('../utils/response');

class PurchaseController {
  async createPurchase(req, res, next) {
    try {
      const validatedData = createPurchaseSchema.parse(req.body);
      const purchase = await purchaseService.createPurchase({
        organizationId: req.organizationId,
        user: req.user,
        purchaseData: validatedData
      });

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Purchase order created successfully',
        data: purchase
      });
    } catch (error) {
      next(error);
    }
  }

  async getPurchases(req, res, next) {
    try {
      const validatedQuery = purchaseQuerySchema.parse(req.query);
      const result = await purchaseService.getPurchases(req.organizationId, validatedQuery);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Purchases retrieved successfully',
        data: {
          purchases: result.purchases,
          summary: result.summary
        },
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  }

  async getPurchaseById(req, res, next) {
    try {
      const purchase = await purchaseService.getPurchaseById(
        req.organizationId,
        req.params.id
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Purchase order retrieved successfully',
        data: purchase
      });
    } catch (error) {
      next(error);
    }
  }

  async updatePurchaseStatus(req, res, next) {
    try {
      const { status, notes } = updatePurchaseStatusSchema.parse(req.body);
      const purchase = await purchaseService.updatePurchaseStatus(
        req.organizationId,
        req.params.id,
        {
          status,
          notes,
          userId: req.user?.id || req.user?._id
        }
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: `Purchase order status updated to ${status}`,
        data: purchase
      });
    } catch (error) {
      next(error);
    }
  }

  async deletePurchase(req, res, next) {
    try {
      const result = await purchaseService.deletePurchase(
        req.organizationId,
        req.params.id
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PurchaseController();
