const categoryService = require('../services/category.service');
const { createCategorySchema } = require('../validators/catalog.validation');
const { sendSuccess } = require('../utils/response');

class CategoryController {
  async getCategories(req, res, next) {
    try {
      const categories = await categoryService.getCategories(req.organizationId);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Categories retrieved successfully',
        data: { categories }
      });
    } catch (error) {
      next(error);
    }
  }

  async createCategory(req, res, next) {
    try {
      const validatedData = createCategorySchema.parse(req.body);
      const category = await categoryService.createCategory(req.organizationId, validatedData);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Category created successfully',
        data: { category }
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteCategory(req, res, next) {
    try {
      const deleted = await categoryService.deleteCategory(req.organizationId, req.params.id);
      return sendSuccess(res, {
        statusCode: 200,
        message: 'Category deleted successfully',
        data: { category: deleted }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CategoryController();
