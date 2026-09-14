const brandService = require('../services/brand.service');
const { createBrandSchema } = require('../validators/catalog.validation');
const { sendSuccess } = require('../utils/response');

class BrandController {
  async getBrands(req, res, next) {
    try {
      const brands = await brandService.getBrands(req.organizationId);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Brands retrieved successfully',
        data: { brands }
      });
    } catch (error) {
      next(error);
    }
  }

  async createBrand(req, res, next) {
    try {
      const validatedData = createBrandSchema.parse(req.body);
      const brand = await brandService.createBrand(req.organizationId, validatedData);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Brand created successfully',
        data: { brand }
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteBrand(req, res, next) {
    try {
      const deleted = await brandService.deleteBrand(req.organizationId, req.params.id);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Brand deleted successfully',
        data: { brand: deleted }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BrandController();
