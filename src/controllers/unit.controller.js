const unitService = require('../services/unit.service');
const { createUnitSchema } = require('../validators/catalog.validation');
const { sendSuccess } = require('../utils/response');

class UnitController {
  async getUnits(req, res, next) {
    try {
      const units = await unitService.getUnits(req.organizationId);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Units retrieved successfully',
        data: { units }
      });
    } catch (error) {
      next(error);
    }
  }

  async createUnit(req, res, next) {
    try {
      const validatedData = createUnitSchema.parse(req.body);
      const unit = await unitService.createUnit(req.organizationId, validatedData);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Unit created successfully',
        data: { unit }
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteUnit(req, res, next) {
    try {
      const deleted = await unitService.deleteUnit(req.organizationId, req.params.id);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Unit deleted successfully',
        data: { unit: deleted }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UnitController();
