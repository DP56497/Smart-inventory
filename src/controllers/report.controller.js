const reportService = require('../services/report.service');
const { sendSuccess } = require('../utils/response');

class ReportController {
  async getFinancialSummary(req, res, next) {
    try {
      const data = await reportService.getFinancialSummary(
        req.organizationId,
        req.query
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Financial summary report generated successfully',
        data
      });
    } catch (error) {
      next(error);
    }
  }

  async getSalesReport(req, res, next) {
    try {
      const data = await reportService.getSalesReport(
        req.organizationId,
        req.query
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Sales analytics report generated successfully',
        data
      });
    } catch (error) {
      next(error);
    }
  }

  async getInventoryReport(req, res, next) {
    try {
      const data = await reportService.getInventoryReport(
        req.organizationId,
        req.query
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Inventory valuation report generated successfully',
        data
      });
    } catch (error) {
      next(error);
    }
  }

  async getPurchasesReport(req, res, next) {
    try {
      const data = await reportService.getPurchasesReport(
        req.organizationId,
        req.query
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Purchases report generated successfully',
        data
      });
    } catch (error) {
      next(error);
    }
  }

  async getCustomerReport(req, res, next) {
    try {
      const data = await reportService.getCustomerReport(
        req.organizationId,
        req.query
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Customer and receivables report generated successfully',
        data
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReportController();
