const Category = require('../models/Category');
const AppError = require('../utils/AppError');

class CategoryService {
  async getCategories(organizationId) {
    return Category.find({ organizationId }).sort({ name: 1 });
  }

  async createCategory(organizationId, data) {
    const existing = await Category.findOne({
      organizationId,
      name: { $regex: new RegExp(`^${data.name.trim()}$`, 'i') }
    });

    if (existing) {
      throw new AppError('Category with this name already exists', 409, 'CATEGORY_EXISTS');
    }

    const category = new Category({
      name: data.name.trim(),
      description: data.description || '',
      status: data.status || 'ACTIVE',
      organizationId
    });

    return category.save();
  }

  async deleteCategory(organizationId, id) {
    const deleted = await Category.findOneAndDelete({ _id: id, organizationId });
    if (!deleted) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }
    return deleted;
  }
}

module.exports = new CategoryService();
