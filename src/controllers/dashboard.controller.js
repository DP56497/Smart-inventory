const dashboardService = require('../services/dashboard.service');
const { sendSuccess } = require('../utils/response');

class DashboardController {
  /**
   * GET /api/v1/dashboard/stats
   * Aggregates organization-scoped metrics, trends, charts, and inventory alerts
   */
  async getDashboardStats(req, res, next) {
    try {
      const data = await dashboardService.getDashboardData(
        req.organizationId,
        req.query,
        req.user?.role
      );

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Dashboard analytics retrieved successfully',
        data
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DashboardController();
