const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const inventoryService = require('./inventory.service');
const AppError = require('../utils/AppError');

class PurchaseService {
  /**
   * Generates a unique PO number: PO-YYYYMMDD-XXXX
   */
  async generatePurchaseNumber(organizationId, session = null) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const prefix = `PO-${year}${month}${day}`;

    const startOfDay = new Date(year, today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfDay = new Date(year, today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const query = Purchase.find({
      organizationId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    })
      .sort({ createdAt: -1 })
      .limit(1);

    if (session) query.session(session);
    const lastPO = await query.lean();

    let seq = 1;
    if (lastPO && lastPO.length > 0 && lastPO[0].purchaseNumber) {
      const parts = lastPO[0].purchaseNumber.split('-');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          seq = lastSeq + 1;
        }
      }
    }

    const paddedSeq = String(seq).padStart(4, '0');
    return `${prefix}-${paddedSeq}`;
  }

  /**
   * Create a new purchase order
   */
  async createPurchase({ organizationId, user, purchaseData }) {
    const userId = user?.id || user?._id;
    const {
      supplierId = null,
      purchaseNumber: manualPoNumber,
      items,
      paymentStatus = 'PAID',
      paidAmount: rawPaidAmount,
      status = 'RECEIVED',
      notes = ''
    } = purchaseData;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Purchase order must have at least one line item', 400, 'EMPTY_ITEMS');
    }

    // Validate supplier if provided
    let supplier = null;
    if (supplierId) {
      if (!mongoose.Types.ObjectId.isValid(supplierId)) {
        throw new AppError('Invalid supplier ID format', 400, 'INVALID_SUPPLIER_ID');
      }
      supplier = await Supplier.findOne({ _id: supplierId, organizationId });
      if (!supplier) {
        throw new AppError('Supplier not found in this organization', 404, 'SUPPLIER_NOT_FOUND');
      }
    }

    // Validate and fetch products
    const productIds = items.map((it) => it.productId);
    const products = await Product.find({
      _id: { $in: productIds },
      organizationId
    });

    if (products.length !== productIds.length) {
      throw new AppError(
        'One or more products were not found or do not belong to this organization',
        404,
        'PRODUCTS_NOT_FOUND'
      );
    }

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    // Calculate line items and totals
    let subtotal = 0;
    let totalTax = 0;

    const lineItems = items.map((item) => {
      const product = productMap.get(item.productId.toString());
      const qty = Number(item.quantity);
      const unitCost = Number(item.unitCost);
      const taxPct = Number(item.taxPercentage || 0);

      if (qty <= 0) {
        throw new AppError(`Quantity for product '${product.name}' must be > 0`, 400, 'INVALID_QUANTITY');
      }
      if (unitCost < 0) {
        throw new AppError(`Unit cost for product '${product.name}' cannot be negative`, 400, 'INVALID_COST');
      }

      const itemSubtotal = Number((qty * unitCost).toFixed(2));
      const itemTaxAmount = Number(((itemSubtotal * taxPct) / 100).toFixed(2));
      const itemTotal = Number((itemSubtotal + itemTaxAmount).toFixed(2));

      subtotal += itemSubtotal;
      totalTax += itemTaxAmount;

      return {
        productId: product._id,
        name: product.name,
        SKU: product.SKU,
        quantity: qty,
        unitCost,
        subtotal: itemSubtotal,
        taxPercentage: taxPct,
        taxAmount: itemTaxAmount,
        total: itemTotal
      };
    });

    subtotal = Number(subtotal.toFixed(2));
    totalTax = Number(totalTax.toFixed(2));
    const grandTotal = Number((subtotal + totalTax).toFixed(2));

    // Calculate paid amount
    let paidAmount = 0;
    if (paymentStatus === 'PAID') {
      paidAmount = grandTotal;
    } else if (paymentStatus === 'PARTIALLY_PAID') {
      paidAmount = Number(rawPaidAmount || 0);
      if (paidAmount < 0) paidAmount = 0;
      if (paidAmount >= grandTotal) {
        paidAmount = grandTotal;
      }
    } else {
      paidAmount = 0;
    }

    return await inventoryService.withSessionTransaction(async (session) => {
      const purchaseNumber =
        manualPoNumber && manualPoNumber.trim()
          ? manualPoNumber.trim().toUpperCase()
          : await this.generatePurchaseNumber(organizationId, session);

      // Check unique purchaseNumber per organization
      const duplicateQuery = Purchase.findOne({ organizationId, purchaseNumber });
      if (session) duplicateQuery.session(session);
      const existing = await duplicateQuery;
      if (existing) {
        throw new AppError(
          `Purchase order number '${purchaseNumber}' already exists in this organization`,
          409,
          'DUPLICATE_PURCHASE_NUMBER'
        );
      }

      // If status is RECEIVED, immediately update stock and record stock movements
      if (status === 'RECEIVED') {
        for (const lineItem of lineItems) {
          await inventoryService.recordStockMovement({
            organizationId,
            branchId: null,
            productId: lineItem.productId,
            type: 'PURCHASE',
            quantity: lineItem.quantity,
            reason: `Inbound Stock - Purchase Order ${purchaseNumber}`,
            referenceId: purchaseNumber,
            referenceType: 'PURCHASE_ORDER',
            userId
          });

          // Update product's latest purchase price if unitCost > 0
          if (lineItem.unitCost > 0) {
            const prodUpdateQuery = Product.updateOne(
              { _id: lineItem.productId, organizationId },
              { $set: { purchasePrice: lineItem.unitCost, updatedBy: userId } }
            );
            if (session) prodUpdateQuery.session(session);
            await prodUpdateQuery;
          }
        }
      }

      // Update supplier totals and payables if linked
      if (supplier) {
        const payableIncrease = grandTotal - paidAmount;
        const supUpdateQuery = Supplier.updateOne(
          { _id: supplier._id, organizationId },
          {
            $inc: {
              totalPurchases: grandTotal,
              totalPaid: paidAmount,
              outstandingPayable: payableIncrease
            },
            $set: { updatedBy: userId }
          }
        );
        if (session) supUpdateQuery.session(session);
        await supUpdateQuery;
      }

      // Create purchase document
      const purchaseDoc = new Purchase({
        organizationId,
        purchaseNumber,
        supplierId: supplier ? supplier._id : null,
        items: lineItems,
        subtotal,
        totalTax,
        grandTotal,
        paidAmount,
        paymentStatus,
        status,
        notes,
        createdBy: userId
      });

      if (session) {
        await purchaseDoc.save({ session });
      } else {
        await purchaseDoc.save();
      }

      return purchaseDoc;
    });
  }

  /**
   * Get paginated purchases with search, filters, and summary metrics
   */
  async getPurchases(organizationId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {
      organizationId: new mongoose.Types.ObjectId(organizationId.toString())
    };

    if (query.supplierId) {
      filter.supplierId = new mongoose.Types.ObjectId(query.supplierId.toString());
    }

    if (query.status && query.status !== 'ALL') {
      filter.status = query.status;
    }

    if (query.paymentStatus && query.paymentStatus !== 'ALL') {
      filter.paymentStatus = query.paymentStatus;
    }

    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (query.search && query.search.trim()) {
      const searchRegex = { $regex: query.search.trim(), $options: 'i' };
      filter.$or = [{ purchaseNumber: searchRegex }, { notes: searchRegex }];
    }

    const [purchases, total, summaryAgg] = await Promise.all([
      Purchase.find(filter)
        .populate('supplierId', 'name companyName phone email')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Purchase.countDocuments(filter),
      Purchase.aggregate([
        {
          $match: {
            organizationId: new mongoose.Types.ObjectId(organizationId.toString()),
            status: { $ne: 'CANCELLED' }
          }
        },
        {
          $group: {
            _id: null,
            totalSpend: { $sum: '$grandTotal' },
            totalPaid: { $sum: '$paidAmount' },
            receivedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'RECEIVED'] }, 1, 0] }
            },
            orderedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'ORDERED'] }, 1, 0] }
            },
            pendingPayable: {
              $sum: { $subtract: ['$grandTotal', '$paidAmount'] }
            }
          }
        }
      ])
    ]);

    const summaryData = summaryAgg[0] || {
      totalSpend: 0,
      totalPaid: 0,
      receivedCount: 0,
      orderedCount: 0,
      pendingPayable: 0
    };

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      purchases,
      summary: {
        totalSpend: Number((summaryData.totalSpend || 0).toFixed(2)),
        totalPaid: Number((summaryData.totalPaid || 0).toFixed(2)),
        pendingPayable: Number(Math.max(0, summaryData.pendingPayable || 0).toFixed(2)),
        totalOrdersCount: total,
        receivedCount: summaryData.receivedCount || 0,
        orderedCount: summaryData.orderedCount || 0
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
   * Get single purchase order by ID
   */
  async getPurchaseById(organizationId, purchaseId) {
    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      throw new AppError('Invalid purchase order ID format', 400, 'INVALID_PURCHASE_ID');
    }

    const purchase = await Purchase.findOne({
      _id: purchaseId,
      organizationId
    })
      .populate('supplierId', 'name companyName phone email address city state gstin')
      .populate('createdBy', 'name email role')
      .populate('items.productId', 'name SKU barcode currentStock unitId')
      .lean();

    if (!purchase) {
      throw new AppError('Purchase order not found in this organization', 404, 'PURCHASE_NOT_FOUND');
    }

    return purchase;
  }

  /**
   * Update purchase order status (e.g. ORDERED -> RECEIVED or CANCELLED)
   */
  async updatePurchaseStatus(organizationId, purchaseId, { status: targetStatus, notes = '', userId }) {
    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      throw new AppError('Invalid purchase order ID format', 400, 'INVALID_PURCHASE_ID');
    }

    return await inventoryService.withSessionTransaction(async (session) => {
      const pQuery = Purchase.findOne({ _id: purchaseId, organizationId });
      if (session) pQuery.session(session);
      const purchase = await pQuery;

      if (!purchase) {
        throw new AppError('Purchase order not found', 404, 'PURCHASE_NOT_FOUND');
      }

      if (purchase.status === targetStatus) {
        return purchase;
      }

      // If transition is ORDERED -> RECEIVED: Stock in all items
      if (purchase.status === 'ORDERED' && targetStatus === 'RECEIVED') {
        for (const item of purchase.items) {
          await inventoryService.recordStockMovement({
            organizationId,
            branchId: null,
            productId: item.productId,
            type: 'PURCHASE',
            quantity: item.quantity,
            reason: `Goods Received - PO #${purchase.purchaseNumber}`,
            referenceId: purchase.purchaseNumber,
            referenceType: 'PURCHASE_ORDER',
            userId
          });
        }
      }

      // If transition is RECEIVED -> CANCELLED: Revert stock items
      if (purchase.status === 'RECEIVED' && targetStatus === 'CANCELLED') {
        for (const item of purchase.items) {
          await inventoryService.recordStockMovement({
            organizationId,
            branchId: null,
            productId: item.productId,
            type: 'PURCHASE_RETURN',
            quantity: item.quantity,
            reason: `PO #${purchase.purchaseNumber} Cancelled - Stock Reversal`,
            referenceId: purchase.purchaseNumber,
            referenceType: 'PURCHASE_ORDER',
            userId
          });
        }
      }

      // If status changed to CANCELLED and supplier was linked, reverse supplier balances
      if (targetStatus === 'CANCELLED' && purchase.supplierId && purchase.status !== 'CANCELLED') {
        const payableDiff = purchase.grandTotal - purchase.paidAmount;
        const supUpdate = Supplier.updateOne(
          { _id: purchase.supplierId, organizationId },
          {
            $inc: {
              totalPurchases: -purchase.grandTotal,
              totalPaid: -purchase.paidAmount,
              outstandingPayable: -payableDiff
            },
            $set: { updatedBy: userId }
          }
        );
        if (session) supUpdate.session(session);
        await supUpdate;
      }

      purchase.status = targetStatus;
      if (notes) {
        purchase.notes = purchase.notes ? `${purchase.notes}\n${notes}` : notes;
      }

      if (session) {
        await purchase.save({ session });
      } else {
        await purchase.save();
      }

      return purchase;
    });
  }

  /**
   * Delete purchase order
   */
  async deletePurchase(organizationId, purchaseId) {
    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      throw new AppError('Invalid purchase order ID format', 400, 'INVALID_PURCHASE_ID');
    }

    const purchase = await Purchase.findOne({ _id: purchaseId, organizationId });
    if (!purchase) {
      throw new AppError('Purchase order not found', 404, 'PURCHASE_NOT_FOUND');
    }

    if (purchase.status === 'RECEIVED') {
      throw new AppError(
        'Cannot delete a received purchase order with stocked inventory. Please cancel it first to reverse stock.',
        400,
        'CANNOT_DELETE_RECEIVED_PURCHASE'
      );
    }

    return await inventoryService.withSessionTransaction(async (session) => {
      // If ORDERED and supplier was linked, reverse supplier balances
      if (purchase.status === 'ORDERED' && purchase.supplierId) {
        const payableDiff = purchase.grandTotal - purchase.paidAmount;
        const supUpdate = Supplier.updateOne(
          { _id: purchase.supplierId, organizationId },
          {
            $inc: {
              totalPurchases: -purchase.grandTotal,
              totalPaid: -purchase.paidAmount,
              outstandingPayable: -payableDiff
            }
          }
        );
        if (session) supUpdate.session(session);
        await supUpdate;
      }

      const delQuery = Purchase.deleteOne({ _id: purchaseId, organizationId });
      if (session) delQuery.session(session);
      await delQuery;

      return { message: 'Purchase order deleted successfully' };
    });
  }
}

module.exports = new PurchaseService();
