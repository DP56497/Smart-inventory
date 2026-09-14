const posService = require('../services/pos.service');
const customerService = require('../services/customer.service');
const { checkoutSchema, customerSchema, saleQuerySchema } = require('../validators/pos.validation');
const { sendSuccess } = require('../utils/response');

class PosController {
  /**
   * POST /api/v1/pos/checkout
   * Processes a sale, validates prices/tax, updates inventory, logs stock movements
   */
  async checkout(req, res, next) {
    try {
      const validatedData = checkoutSchema.parse(req.body);

      const result = await posService.processCheckout({
        organizationId: req.organizationId,
        user: req.user,
        checkoutData: validatedData
      });

      return sendSuccess(res, {
        statusCode: result.isDuplicate ? 200 : 201,
        message: result.message,
        data: result.sale
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/pos/sales
   * Paginated sales history with filters
   */
  async getSales(req, res, next) {
    try {
      const query = saleQuerySchema.parse(req.query);

      const result = await posService.getSales(req.organizationId, query);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Sales retrieved successfully',
        data: result.sales,
        meta: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/pos/sales/:id
   * Single sale details / invoice retrieval
   */
  async getSaleById(req, res, next) {
    try {
      const sale = await posService.getSaleById(req.organizationId, req.params.id);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Sale retrieved successfully',
        data: sale
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/pos/products
   * POS product catalog search with barcode and inventory stock levels
   */
  async searchProducts(req, res, next) {
    try {
      const products = await posService.searchPosProducts(req.organizationId, req.query);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'POS products retrieved successfully',
        data: products
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/pos/customers
   * Quick-search customers for POS autocomplete
   */
  async getCustomers(req, res, next) {
    try {
      const customers = await customerService.getCustomers(req.organizationId, req.query);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Customers retrieved successfully',
        data: customers
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/pos/customers
   * Quick-add customer modal from POS
   */
  async createCustomer(req, res, next) {
    try {
      const validatedData = customerSchema.parse(req.body);

      const customer = await customerService.createCustomer(
        req.organizationId,
        req.user.id,
        validatedData
      );

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Customer created successfully',
        data: customer
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PosController();
