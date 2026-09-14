const customerService = require('../services/customer.service');
const {
  createCustomerSchema,
  updateCustomerSchema,
  customerQuerySchema,
  recordCustomerPaymentSchema
} = require('../validators/customer.validation');
const { sendSuccess } = require('../utils/response');

class CustomerController {
  async getCustomers(req, res, next) {
    try {
      const query = customerQuerySchema.parse(req.query);
      const result = await customerService.getCustomers(req.organizationId, query);

      if (result && result.customers !== undefined) {
        return sendSuccess(res, {
          statusCode: 200,
          message: 'Customers retrieved successfully',
          data: result.customers,
          meta: result.pagination
        });
      }

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Customers retrieved successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerById(req, res, next) {
    try {
      const customer = await customerService.getCustomerById(req.organizationId, req.params.id);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Customer retrieved successfully',
        data: customer
      });
    } catch (error) {
      next(error);
    }
  }

  async createCustomer(req, res, next) {
    try {
      const validatedData = createCustomerSchema.parse(req.body);
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

  async updateCustomer(req, res, next) {
    try {
      const validatedData = updateCustomerSchema.parse(req.body);
      const customer = await customerService.updateCustomer(
        req.organizationId,
        req.params.id,
        req.user.id,
        validatedData
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Customer updated successfully',
        data: customer
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteCustomer(req, res, next) {
    try {
      const result = await customerService.deleteCustomer(req.organizationId, req.params.id);

      return sendSuccess(res, {
        statusCode: 200,
        message: result.message,
        data: { deactivated: result.deactivated }
      });
    } catch (error) {
      next(error);
    }
  }

  async recordCustomerPayment(req, res, next) {
    try {
      const validatedData = recordCustomerPaymentSchema.parse(req.body);
      const result = await customerService.recordCustomerPayment(
        req.organizationId,
        req.params.id,
        req.user.id,
        validatedData
      );

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Customer payment recorded successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerSummary(req, res, next) {
    try {
      const summary = await customerService.getCustomerSummary(req.organizationId, req.params.id);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Customer summary retrieved successfully',
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerSales(req, res, next) {
    try {
      const result = await customerService.getCustomerSales(
        req.organizationId,
        req.params.id,
        req.query
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Customer sales retrieved successfully',
        data: result.sales,
        meta: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerPayments(req, res, next) {
    try {
      const result = await customerService.getCustomerPayments(
        req.organizationId,
        req.params.id,
        req.query
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Customer payments retrieved successfully',
        data: result.payments,
        meta: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerLedger(req, res, next) {
    try {
      const ledger = await customerService.getCustomerLedger(req.organizationId, req.params.id);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Customer ledger retrieved successfully',
        data: ledger
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CustomerController();
