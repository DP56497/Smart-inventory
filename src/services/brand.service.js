const Brand = require('../models/Brand');
const AppError = require('../utils/AppError');

class BrandService {
  async getBrands(organizationId) {
    return Brand.find({ organizationId }).sort({ name: 1 });
  }

  async createBrand(organizationId, data) {
    const existing = await Brand.findOne({
      organizationId,
      name: { $regex: new RegExp(`^${data.name.trim()}$`, 'i') }
    });

    if (existing) {
      throw new AppError('Brand with this name already exists', 409, 'BRAND_EXISTS');
    }

    const brand = new Brand({
      name: data.name.trim(),
      description: data.description || '',
      status: data.status || 'ACTIVE',
      organizationId
    });

    return brand.save();
  }

  async deleteBrand(organizationId, id) {
    const deleted = await Brand.findOneAndDelete({ _id: id, organizationId });
    if (!deleted) {
      throw new AppError('Brand not found', 404, 'BRAND_NOT_FOUND');
    }
    return deleted;
  }
}

module.exports = new BrandService();
