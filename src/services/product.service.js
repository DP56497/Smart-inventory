const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Unit = require('../models/Unit');
const AppError = require('../utils/AppError');

class ProductService {
  /**
   * Retrieves paginated products for the organization with comprehensive filtering and sorting.
   */
  async getProducts(organizationId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    // Strict organization scoping
    const filter = {
      organizationId: new mongoose.Types.ObjectId(organizationId.toString())
    };

    // Status filter
    if (query.status && query.status !== 'ALL') {
      filter.status = query.status;
    }

    // Category filter
    if (query.categoryId) {
      filter.categoryId = new mongoose.Types.ObjectId(query.categoryId.toString());
    }

    // Brand filter
    if (query.brandId) {
      filter.brandId = new mongoose.Types.ObjectId(query.brandId.toString());
    }

    // Unit filter
    if (query.unitId) {
      filter.unitId = new mongoose.Types.ObjectId(query.unitId.toString());
    }

    // Barcode specific search/filter
    if (query.barcode) {
      filter.barcode = { $regex: query.barcode.trim(), $options: 'i' };
    }

    // SKU specific search/filter
    if (query.sku) {
      filter.SKU = { $regex: query.sku.trim(), $options: 'i' };
    }

    // Low stock filter (currentStock > 0 and currentStock <= reorderLevel)
    if (query.lowStock === true || query.lowStock === 'true') {
      filter.$expr = {
        $and: [
          { $gt: ['$currentStock', 0] },
          { $lte: ['$currentStock', '$reorderLevel'] }
        ]
      };
    }

    // Out of stock filter (currentStock <= 0)
    if (query.outOfStock === true || query.outOfStock === 'true') {
      filter.currentStock = { $lte: 0 };
    }

    // General search across name, SKU, and barcode
    if (query.search && query.search.trim() !== '') {
      const searchRegex = { $regex: query.search.trim(), $options: 'i' };
      const searchConditions = [
        { name: searchRegex },
        { SKU: searchRegex },
        { barcode: searchRegex },
        { description: searchRegex }
      ];

      if (filter.$or) {
        filter.$and = filter.$and || [];
        filter.$and.push({ $or: searchConditions });
      } else {
        filter.$or = searchConditions;
      }
    }

    // Dynamic sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('unitId', 'name code')
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      products,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

  /**
   * Retrieves single product by ID scoped strictly to organization.
   */
  async getProductById(organizationId, productId) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new AppError('Invalid product ID format', 400, 'INVALID_PRODUCT_ID');
    }

    const product = await Product.findOne({
      _id: productId,
      organizationId
    })
      .populate('categoryId', 'name description')
      .populate('brandId', 'name description')
      .populate('unitId', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!product) {
      throw new AppError('Product not found in this organization', 404, 'PRODUCT_NOT_FOUND');
    }

    return product;
  }

  /**
   * Creates a new product enforcing organization scoping and SKU/Barcode uniqueness.
   */
  async createProduct(organizationId, userId, productData) {
    const sku = productData.SKU.trim().toUpperCase();

    // Check SKU uniqueness within organization
    const existingSku = await Product.findOne({
      organizationId,
      SKU: sku
    });

    if (existingSku) {
      throw new AppError(`Product with SKU '${sku}' already exists in your organization`, 409, 'DUPLICATE_SKU');
    }

    // Check Barcode uniqueness if barcode is provided
    if (productData.barcode && productData.barcode.trim()) {
      const barcode = productData.barcode.trim();
      const existingBarcode = await Product.findOne({
        organizationId,
        barcode
      });

      if (existingBarcode) {
        throw new AppError(`Product with barcode '${barcode}' already exists in your organization`, 409, 'DUPLICATE_BARCODE');
      }
    }

    // Verify referenced foreign models belong to the same organization
    if (productData.categoryId) {
      const cat = await Category.findOne({ _id: productData.categoryId, organizationId });
      if (!cat) {
        throw new AppError('Selected category does not exist in your organization', 400, 'INVALID_CATEGORY');
      }
    }

    if (productData.brandId) {
      const brand = await Brand.findOne({ _id: productData.brandId, organizationId });
      if (!brand) {
        throw new AppError('Selected brand does not exist in your organization', 400, 'INVALID_BRAND');
      }
    }

    if (productData.unitId) {
      const unit = await Unit.findOne({ _id: productData.unitId, organizationId });
      if (!unit) {
        throw new AppError('Selected unit does not exist in your organization', 400, 'INVALID_UNIT');
      }
    }

    const product = new Product({
      ...productData,
      SKU: sku,
      barcode: productData.barcode ? productData.barcode.trim() : '',
      organizationId,
      createdBy: userId,
      updatedBy: userId
    });

    const saved = await product.save();

    if (saved.currentStock > 0) {
      const StockMovement = require('../models/StockMovement');
      await StockMovement.create({
        organizationId,
        branchId: saved.branchId || null,
        productId: saved._id,
        type: 'ADJUSTMENT_IN',
        quantity: saved.currentStock,
        previousStock: 0,
        newStock: saved.currentStock,
        referenceId: null,
        referenceType: 'INITIAL_STOCK',
        reason: 'Initial stock recorded on product creation',
        createdBy: userId
      });
    }

    return this.getProductById(organizationId, saved._id);
  }

  /**
   * Updates an existing product scoped to organization.
   */
  async updateProduct(organizationId, productId, userId, updateData) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new AppError('Invalid product ID format', 400, 'INVALID_PRODUCT_ID');
    }

    const product = await Product.findOne({ _id: productId, organizationId });
    if (!product) {
      throw new AppError('Product not found in this organization', 404, 'PRODUCT_NOT_FOUND');
    }

    // If SKU is being changed, ensure uniqueness
    if (updateData.SKU) {
      const newSku = updateData.SKU.trim().toUpperCase();
      if (newSku !== product.SKU) {
        const existingSku = await Product.findOne({
          organizationId,
          SKU: newSku,
          _id: { $ne: productId }
        });

        if (existingSku) {
          throw new AppError(`Product with SKU '${newSku}' already exists in your organization`, 409, 'DUPLICATE_SKU');
        }
        product.SKU = newSku;
      }
    }

    // If Barcode is being changed, ensure uniqueness
    if (updateData.barcode !== undefined) {
      const newBarcode = (updateData.barcode || '').trim();
      if (newBarcode && newBarcode !== product.barcode) {
        const existingBarcode = await Product.findOne({
          organizationId,
          barcode: newBarcode,
          _id: { $ne: productId }
        });

        if (existingBarcode) {
          throw new AppError(`Product with barcode '${newBarcode}' already exists in your organization`, 409, 'DUPLICATE_BARCODE');
        }
      }
      product.barcode = newBarcode;
    }

    // Verify relations if updated
    if (updateData.categoryId && updateData.categoryId !== product.categoryId?.toString()) {
      const cat = await Category.findOne({ _id: updateData.categoryId, organizationId });
      if (!cat) throw new AppError('Selected category does not exist', 400, 'INVALID_CATEGORY');
      product.categoryId = updateData.categoryId;
    } else if (updateData.categoryId === null) {
      product.categoryId = null;
    }

    if (updateData.brandId && updateData.brandId !== product.brandId?.toString()) {
      const brand = await Brand.findOne({ _id: updateData.brandId, organizationId });
      if (!brand) throw new AppError('Selected brand does not exist', 400, 'INVALID_BRAND');
      product.brandId = updateData.brandId;
    } else if (updateData.brandId === null) {
      product.brandId = null;
    }

    if (updateData.unitId && updateData.unitId !== product.unitId?.toString()) {
      const unit = await Unit.findOne({ _id: updateData.unitId, organizationId });
      if (!unit) throw new AppError('Selected unit does not exist', 400, 'INVALID_UNIT');
      product.unitId = updateData.unitId;
    } else if (updateData.unitId === null) {
      product.unitId = null;
    }

    // Update regular fields (direct currentStock modification is prohibited)
    const directFields = [
      'name',
      'purchasePrice',
      'sellingPrice',
      'taxPercentage',
      'minimumStock',
      'maximumStock',
      'reorderLevel',
      'supplierId',
      'branchId',
      'description',
      'images',
      'status'
    ];

    for (const field of directFields) {
      if (updateData[field] !== undefined) {
        product[field] = updateData[field];
      }
    }

    product.updatedBy = userId;
    await product.save();

    return this.getProductById(organizationId, productId);
  }

  /**
   * Deletes a product strictly scoped to organization.
   */
  async deleteProduct(organizationId, productId) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new AppError('Invalid product ID format', 400, 'INVALID_PRODUCT_ID');
    }

    const product = await Product.findOneAndDelete({
      _id: productId,
      organizationId
    });

    if (!product) {
      throw new AppError('Product not found in this organization', 404, 'PRODUCT_NOT_FOUND');
    }

    return { id: productId, name: product.name, SKU: product.SKU };
  }
}

module.exports = new ProductService();
