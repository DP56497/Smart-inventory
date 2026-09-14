const organizationService = require('../services/organization.service');
const { updateProfileSchema, updateSettingsSchema } = require('../validators/organization.validation');
const { sendSuccess } = require('../utils/response');

class OrganizationController {
  async getProfile(req, res, next) {
    try {
      const organization = await organizationService.getProfile(req.organizationId);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Organization profile retrieved',
        data: { organization }
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const validatedData = updateProfileSchema.parse(req.body);
      const updatedOrg = await organizationService.updateProfile(req.organizationId, validatedData);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Organization profile updated successfully',
        data: { organization: updatedOrg }
      });
    } catch (error) {
      next(error);
    }
  }

  async getSettings(req, res, next) {
    try {
      const settings = await organizationService.getSettings(req.organizationId);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Organization settings retrieved',
        data: { settings }
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req, res, next) {
    try {
      const validatedData = updateSettingsSchema.parse(req.body);
      const updatedSettings = await organizationService.updateSettings(req.organizationId, validatedData);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Organization settings updated successfully',
        data: { settings: updatedSettings }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrganizationController();
