const supplierService = require('../services/supplier.service');
const {
  createSupplierSchema,
  updateSupplierSchema,
  supplierQuerySchema
} = require('../validators/supplier.validation');
const { sendSuccess } = require('../utils/response');

class SupplierController {
  async getSuppliers(req, res, next) {
    try {
      const query = supplierQuerySchema.parse(req.query);
      const result = await supplierService.getSuppliers(req.organizationId, query);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Suppliers retrieved successfully',
        data: result.suppliers,
        meta: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async getSupplierById(req, res, next) {
    try {
      const supplier = await supplierService.getSupplierById(
        req.organizationId,
        req.params.id
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Supplier retrieved successfully',
        data: supplier
      });
    } catch (error) {
      next(error);
    }
  }

  async createSupplier(req, res, next) {
    try {
      const validatedData = createSupplierSchema.parse(req.body);
      const supplier = await supplierService.createSupplier(
        req.organizationId,
        req.user.id,
        validatedData
      );

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Supplier created successfully',
        data: supplier
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSupplier(req, res, next) {
    try {
      const validatedData = updateSupplierSchema.parse(req.body);
      const supplier = await supplierService.updateSupplier(
        req.organizationId,
        req.params.id,
        req.user.id,
        validatedData
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Supplier updated successfully',
        data: supplier
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteSupplier(req, res, next) {
    try {
      const result = await supplierService.deleteSupplier(
        req.organizationId,
        req.params.id
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: result.message,
        data: { deactivated: result.deactivated }
      });
    } catch (error) {
      next(error);
    }
  }

  async getSupplierSummary(req, res, next) {
    try {
      const summary = await supplierService.getSupplierSummary(
        req.organizationId,
        req.params.id
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Supplier summary retrieved successfully',
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  async getSupplierPurchases(req, res, next) {
    try {
      const result = await supplierService.getSupplierPurchases(
        req.organizationId,
        req.params.id,
        req.query
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Supplier purchases retrieved successfully',
        data: result.purchases,
        meta: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async getSupplierLedger(req, res, next) {
    try {
      const ledger = await supplierService.getSupplierLedger(
        req.organizationId,
        req.params.id
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Supplier ledger retrieved successfully',
        data: ledger
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SupplierController();
