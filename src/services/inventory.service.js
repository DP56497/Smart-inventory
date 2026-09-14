const mongoose = require('mongoose');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const AppError = require('../utils/AppError');

const INBOUND_TYPES = ['PURCHASE', 'SALE_RETURN', 'ADJUSTMENT_IN', 'TRANSFER_IN'];
const OUTBOUND_TYPES = ['SALE', 'PURCHASE_RETURN', 'DAMAGE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT'];

class InventoryService {
  /**
   * Helper to execute in an ACID transaction if replica set is active,
   * with graceful fallback and manual compensation rollback if in standalone mode (e.g. tests).
   */
  async withSessionTransaction(fn) {
    let session = null;
    try {
      session = await mongoose.startSession();
      let result;
      try {
        await session.withTransaction(async () => {
          result = await fn(session);
        });
        return result;
      } catch (txErr) {
        // If standalone Mongo (e.g. mongodb-memory-server default), fallback to non-transactional execution
        if (
          txErr.message &&
          txErr.message.includes('Transaction numbers are only allowed on a replica set member')
        ) {
          return await fn(null);
        }
        throw txErr;
      }
    } catch (sessionErr) {
      if (
        sessionErr.message &&
        sessionErr.message.includes('Transaction numbers are only allowed on a replica set member')
      ) {
        return await fn(null);
      }
      throw sessionErr;
    } finally {
      if (session) {
        await session.endSession();
      }
    }
  }

  /**
   * Core atomic stock mutation method:
   * 1. Reads current stock.
   * 2. Validates operation and balance.
   * 3. Calculates new stock.
   * 4. Updates product stock conditionally.
   * 5. Creates stock movement audit record.
   * 6. Ensures atomicity and handles rollback.
   */
  async recordStockMovement({
    organizationId,
    branchId = null,
    productId,
    type,
    quantity,
    reason = '',
    referenceId = null,
    referenceType = 'MANUAL_ADJUSTMENT',
    userId
  }) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new AppError('Invalid product ID format', 400, 'INVALID_PRODUCT_ID');
    }

    const qty = Number(quantity);
    if (!qty || qty <= 0 || isNaN(qty)) {
      throw new AppError('Quantity must be a positive number greater than 0', 400, 'INVALID_QUANTITY');
    }

    const isAddition = INBOUND_TYPES.includes(type);
    const isDeduction = OUTBOUND_TYPES.includes(type);

    if (!isAddition && !isDeduction) {
      throw new AppError(`Unsupported stock movement type '${type}'`, 400, 'INVALID_MOVEMENT_TYPE');
    }

    return this.withSessionTransaction(async (session) => {
      // Retry loop for optimistic concurrency control (up to 10 attempts)
      const MAX_RETRIES = 10;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        // 1. Read current stock scoped to organization
        const productQuery = Product.findOne({
          _id: productId,
          organizationId
        });
        if (session) productQuery.session(session);
        const product = await productQuery;

        if (!product) {
          throw new AppError('Product not found in this organization', 404, 'PRODUCT_NOT_FOUND');
        }

        const previousStock = product.currentStock;

        // 2. Validate the operation
        if (isDeduction && previousStock < qty) {
          throw new AppError(
            `Insufficient stock for product '${product.name}'. Available: ${previousStock}, Requested: ${qty}`,
            400,
            'INSUFFICIENT_STOCK'
          );
        }

        // 3. Calculate new stock
        const newStock = isAddition ? previousStock + qty : previousStock - qty;

        // 4. Update product stock atomically with optimistic concurrency matching previousStock
        const updateFilter = {
          _id: productId,
          organizationId,
          currentStock: previousStock
        };

        const updateData = {
          $set: {
            currentStock: newStock,
            updatedBy: userId
          }
        };

        const updateOptions = { new: true };
        if (session) updateOptions.session = session;

        const updatedProduct = await Product.findOneAndUpdate(updateFilter, updateData, updateOptions);

        if (!updatedProduct) {
          // Concurrency conflict occurred (another process modified stock concurrently)
          if (attempt < MAX_RETRIES) {
            // Jittered backoff to allow race conditions to resolve smoothly
            const backoffMs = Math.floor(10 * Math.pow(1.4, attempt) + Math.random() * 25);
            await new Promise((res) => setTimeout(res, backoffMs));
            continue;
          }
          throw new AppError(
            'Concurrent stock modification conflict. Please retry the operation.',
            409,
            'CONCURRENCY_CONFLICT'
          );
        }

        // 5. Create stock movement record
        try {
          const movementData = {
            organizationId,
            branchId: branchId || product.branchId || null,
            productId,
            type,
            quantity: qty,
            previousStock,
            newStock,
            referenceId: referenceId ? String(referenceId) : null,
            referenceType: referenceType || 'MANUAL_ADJUSTMENT',
            reason: reason || '',
            createdBy: userId
          };

          let savedMovement;
          if (session) {
            const movement = new StockMovement(movementData);
            savedMovement = await movement.save({ session });
          } else {
            savedMovement = await StockMovement.create(movementData);
          }

          return {
            product: updatedProduct,
            movement: savedMovement
          };
        } catch (movementErr) {
          // 7. Roll back on failure (if not in transaction session)
          if (!session) {
            await Product.updateOne(
              { _id: productId, organizationId },
              { $set: { currentStock: previousStock } }
            );
          }
          throw movementErr;
        }
      }
    });
  }

  /**
   * Helper to derive stock status string
   */
  calculateStockStatus(currentStock, minimumStock, reorderLevel, maximumStock) {
    if (currentStock <= 0) return 'OUT_OF_STOCK';
    if (reorderLevel > 0 && currentStock <= reorderLevel) return 'LOW_STOCK';
    if (maximumStock > 0 && currentStock > maximumStock) return 'OVER_STOCK';
    return 'IN_STOCK';
  }

  /**
   * GET /api/inventory
   * Paginated inventory list with rich financial valuations, thresholds, and summary metrics.
   */
  async getInventory(organizationId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {
      organizationId: new mongoose.Types.ObjectId(organizationId.toString())
    };

    if (query.categoryId) {
      filter.categoryId = new mongoose.Types.ObjectId(query.categoryId.toString());
    }

    if (query.brandId) {
      filter.brandId = new mongoose.Types.ObjectId(query.brandId.toString());
    }

    // Status filter
    if (query.status === 'LOW_STOCK') {
      filter.$expr = {
        $and: [{ $gt: ['$currentStock', 0] }, { $lte: ['$currentStock', '$reorderLevel'] }]
      };
    } else if (query.status === 'OUT_OF_STOCK') {
      filter.currentStock = { $lte: 0 };
    } else if (query.status === 'OVER_STOCK') {
      filter.$expr = {
        $and: [{ $gt: ['$maximumStock', 0] }, { $gt: ['$currentStock', '$maximumStock'] }]
      };
    } else if (query.status === 'IN_STOCK') {
      filter.$expr = {
        $and: [
          { $gt: ['$currentStock', 0] },
          { $gt: ['$currentStock', '$reorderLevel'] }
        ]
      };
    }

    if (query.search && query.search.trim()) {
      const searchRegex = { $regex: query.search.trim(), $options: 'i' };
      const searchOr = [
        { name: searchRegex },
        { SKU: searchRegex },
        { barcode: searchRegex }
      ];
      if (filter.$or) {
        filter.$and = filter.$and || [];
        filter.$and.push({ $or: searchOr });
      } else {
        filter.$or = searchOr;
      }
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const [products, total, summaryAggregate] = await Promise.all([
      Product.find(filter)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('unitId', 'name code')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
      Product.aggregate([
        {
          $match: {
            organizationId: new mongoose.Types.ObjectId(organizationId.toString())
          }
        },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            totalQuantity: { $sum: '$currentStock' },
            totalValuePurchase: {
              $sum: { $multiply: ['$currentStock', '$purchasePrice'] }
            },
            totalValueSelling: {
              $sum: { $multiply: ['$currentStock', '$sellingPrice'] }
            },
            lowStockCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$currentStock', 0] },
                      { $lte: ['$currentStock', '$reorderLevel'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            outOfStockCount: {
              $sum: {
                $cond: [{ $lte: ['$currentStock', 0] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);

    // Enrich products with computed stock values & status
    const enrichedProducts = products.map((prod) => {
      const stockValuePurchase = Number((prod.currentStock * prod.purchasePrice).toFixed(2));
      const stockValueSelling = Number((prod.currentStock * prod.sellingPrice).toFixed(2));
      const stockStatus = this.calculateStockStatus(
        prod.currentStock,
        prod.minimumStock,
        prod.reorderLevel,
        prod.maximumStock
      );
      return {
        ...prod,
        stockValuePurchase,
        stockValueSelling,
        stockStatus
      };
    });

    const summary = summaryAggregate[0] || {
      totalItems: total,
      totalQuantity: 0,
      totalValuePurchase: 0,
      totalValueSelling: 0,
      lowStockCount: 0,
      outOfStockCount: 0
    };

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      products: enrichedProducts,
      summary: {
        totalItems: summary.totalItems,
        totalQuantity: summary.totalQuantity,
        totalValuePurchase: Number((summary.totalValuePurchase || 0).toFixed(2)),
        totalValueSelling: Number((summary.totalValueSelling || 0).toFixed(2)),
        potentialProfit: Number(
          ((summary.totalValueSelling || 0) - (summary.totalValuePurchase || 0)).toFixed(2)
        ),
        lowStockCount: summary.lowStockCount,
        outOfStockCount: summary.outOfStockCount
      },
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
   * GET /api/inventory/:productId
   * Single product inventory details + recent movement history.
   */
  async getProductInventory(organizationId, productId) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new AppError('Invalid product ID format', 400, 'INVALID_PRODUCT_ID');
    }

    const product = await Product.findOne({
      _id: productId,
      organizationId
    })
      .populate('categoryId', 'name')
      .populate('brandId', 'name')
      .populate('unitId', 'name code')
      .lean();

    if (!product) {
      throw new AppError('Product not found in this organization', 404, 'PRODUCT_NOT_FOUND');
    }

    const recentMovements = await StockMovement.find({
      organizationId,
      productId
    })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const stockValuePurchase = Number((product.currentStock * product.purchasePrice).toFixed(2));
    const stockValueSelling = Number((product.currentStock * product.sellingPrice).toFixed(2));
    const stockStatus = this.calculateStockStatus(
      product.currentStock,
      product.minimumStock,
      product.reorderLevel,
      product.maximumStock
    );

    return {
      ...product,
      stockValuePurchase,
      stockValueSelling,
      stockStatus,
      recentMovements
    };
  }

  /**
   * GET /api/inventory/movements
   * Paginated stock movement audit trail.
   */
  async getStockMovements(organizationId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = {
      organizationId: new mongoose.Types.ObjectId(organizationId.toString())
    };

    if (query.productId) {
      filter.productId = new mongoose.Types.ObjectId(query.productId.toString());
    }

    if (query.type && query.type !== 'ALL') {
      filter.type = query.type;
    }

    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }

    if (query.search && query.search.trim()) {
      filter.reason = { $regex: query.search.trim(), $options: 'i' };
    }

    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .populate('productId', 'name SKU barcode unitId')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StockMovement.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      movements,
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
   * POST /api/inventory/adjustment
   * Manual stock adjustment endpoint.
   */
  async adjustStock(organizationId, userId, { productId, type, quantity, reason, referenceId }) {
    if (!['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].includes(type)) {
      throw new AppError(
        "Stock adjustments can only be of type 'ADJUSTMENT_IN' or 'ADJUSTMENT_OUT'",
        400,
        'INVALID_ADJUSTMENT_TYPE'
      );
    }

    return this.recordStockMovement({
      organizationId,
      productId,
      type,
      quantity,
      reason,
      referenceId,
      referenceType: 'MANUAL_ADJUSTMENT',
      userId
    });
  }

  /**
   * GET /api/inventory/low-stock
   */
  async getLowStock(organizationId, query = {}) {
    return this.getInventory(organizationId, { ...query, status: 'LOW_STOCK' });
  }

  /**
   * GET /api/inventory/out-of-stock
   */
  async getOutOfStock(organizationId, query = {}) {
    return this.getInventory(organizationId, { ...query, status: 'OUT_OF_STOCK' });
  }
}

module.exports = new InventoryService();
