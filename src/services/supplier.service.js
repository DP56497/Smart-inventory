const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const AppError = require('../utils/AppError');

class SupplierService {
  /**
   * List and search suppliers with pagination and filtering
   */
  async getSuppliers(organizationId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {
      organizationId: new mongoose.Types.ObjectId(organizationId.toString())
    };

    if (query.status && query.status !== 'ALL') {
      filter.status = query.status;
    }

    if (query.hasBalance === 'YES') {
      filter.outstandingPayable = { $gt: 0 };
    } else if (query.hasBalance === 'NO') {
      filter.outstandingPayable = { $lte: 0 };
    }

    if (query.search && query.search.trim()) {
      const searchRegex = { $regex: query.search.trim(), $options: 'i' };
      filter.$or = [
        { name: searchRegex },
        { companyName: searchRegex },
        { phone: searchRegex },
        { email: searchRegex }
      ];
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const [suppliers, total] = await Promise.all([
      Supplier.find(filter)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Supplier.countDocuments(filter)
    ]);

    return {
      suppliers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single supplier by ID
   */
  async getSupplierById(organizationId, supplierId) {
    if (!mongoose.Types.ObjectId.isValid(supplierId)) {
      throw new AppError('Invalid supplier ID format', 400, 'INVALID_SUPPLIER_ID');
    }

    const supplier = await Supplier.findOne({
      _id: supplierId,
      organizationId
    })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    if (!supplier) {
      throw new AppError('Supplier not found in this organization', 404, 'SUPPLIER_NOT_FOUND');
    }

    return supplier;
  }

  /**
   * Create new supplier
   */
  async createSupplier(organizationId, userId, supplierData) {
    const openingBalance = Number(supplierData.openingBalance) || 0;

    const supplier = new Supplier({
      ...supplierData,
      organizationId,
      outstandingPayable: openingBalance,
      createdBy: userId
    });

    return await supplier.save();
  }

  /**
   * Update existing supplier
   */
  async updateSupplier(organizationId, supplierId, userId, updateData) {
    if (!mongoose.Types.ObjectId.isValid(supplierId)) {
      throw new AppError('Invalid supplier ID format', 400, 'INVALID_SUPPLIER_ID');
    }

    const supplier = await Supplier.findOneAndUpdate(
      { _id: supplierId, organizationId },
      {
        ...updateData,
        updatedBy: userId
      },
      { new: true, runValidators: true }
    );

    if (!supplier) {
      throw new AppError('Supplier not found in this organization', 404, 'SUPPLIER_NOT_FOUND');
    }

    return supplier;
  }

  /**
   * Safe delete or deactivation
   */
  async deleteSupplier(organizationId, supplierId) {
    if (!mongoose.Types.ObjectId.isValid(supplierId)) {
      throw new AppError('Invalid supplier ID format', 400, 'INVALID_SUPPLIER_ID');
    }

    const supplier = await Supplier.findOne({ _id: supplierId, organizationId });
    if (!supplier) {
      throw new AppError('Supplier not found in this organization', 404, 'SUPPLIER_NOT_FOUND');
    }

    // Check if supplier has purchases associated
    const purchaseCount = await Purchase.countDocuments({
      organizationId,
      supplierId
    });

    if (purchaseCount > 0) {
      // Soft-deactivate to protect financial integrity
      supplier.status = 'INACTIVE';
      await supplier.save();
      return {
        deactivated: true,
        message: 'Supplier has associated purchase records and was deactivated instead of deleted'
      };
    }

    await Supplier.deleteOne({ _id: supplierId, organizationId });
    return {
      deactivated: false,
      message: 'Supplier deleted successfully'
    };
  }

  /**
   * Get supplier summary stats
   */
  async getSupplierSummary(organizationId, supplierId) {
    const supplier = await this.getSupplierById(organizationId, supplierId);

    const purchaseAgg = await Purchase.aggregate([
      {
        $match: {
          organizationId: new mongoose.Types.ObjectId(organizationId.toString()),
          supplierId: new mongoose.Types.ObjectId(supplierId.toString()),
          status: { $ne: 'CANCELLED' }
        }
      },
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: '$grandTotal' },
          totalPaid: { $sum: { $ifNull: ['$paidAmount', '$grandTotal'] } },
          count: { $sum: 1 }
        }
      }
    ]);

    const summary = purchaseAgg[0] || {
      totalPurchases: supplier.totalPurchases || 0,
      totalPaid: supplier.totalPaid || 0,
      count: 0
    };

    return {
      supplierId: supplier._id,
      name: supplier.name,
      companyName: supplier.companyName,
      totalPurchases: summary.totalPurchases,
      totalPaid: summary.totalPaid,
      outstandingPayable: supplier.outstandingPayable,
      creditLimit: supplier.creditLimit,
      purchaseCount: summary.count
    };
  }

  /**
   * Get supplier purchase history
   */
  async getSupplierPurchases(organizationId, supplierId, query = {}) {
    await this.getSupplierById(organizationId, supplierId);

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {
      organizationId: new mongoose.Types.ObjectId(organizationId.toString()),
      supplierId: new mongoose.Types.ObjectId(supplierId.toString())
    };

    const [purchases, total] = await Promise.all([
      Purchase.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Purchase.countDocuments(filter)
    ]);

    return {
      purchases,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get supplier ledger
   */
  async getSupplierLedger(organizationId, supplierId) {
    const supplier = await this.getSupplierById(organizationId, supplierId);

    const purchases = await Purchase.find({
      organizationId,
      supplierId
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const ledgerEntries = purchases.map((p) => ({
      date: p.createdAt,
      reference: p.purchaseNumber,
      type: 'PURCHASE',
      debit: p.grandTotal,
      credit: p.paidAmount || p.grandTotal,
      balance: p.dueAmount || 0,
      status: p.paymentStatus
    }));

    return {
      supplier: {
        _id: supplier._id,
        name: supplier.name,
        companyName: supplier.companyName,
        outstandingPayable: supplier.outstandingPayable
      },
      ledger: ledgerEntries
    };
  }
}

module.exports = new SupplierService();
