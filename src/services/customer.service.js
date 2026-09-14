const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const CustomerPayment = require('../models/CustomerPayment');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');

class CustomerService {
  /**
   * Search/list customers with pagination, status filter, balance filter
   * Compatible with POS quick search (returns array when page not specified)
   */
  async getCustomers(organizationId, query = {}) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    const filter = { organizationId: orgId };

    if (query.status && query.status !== 'ALL') {
      filter.status = query.status;
    }

    if (query.hasBalance === 'YES') {
      filter.outstandingBalance = { $gt: 0 };
    } else if (query.hasBalance === 'NO') {
      filter.outstandingBalance = { $lte: 0 };
    }

    if (query.search && query.search.trim()) {
      const searchRegex = { $regex: query.search.trim(), $options: 'i' };
      filter.$or = [{ name: searchRegex }, { phone: searchRegex }, { email: searchRegex }];
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    // If query.page is specified, return paginated SaaS format
    if (query.page !== undefined) {
      const page = Math.max(1, parseInt(query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
      const skip = (page - 1) * limit;

      const [customers, total] = await Promise.all([
        Customer.find(filter)
          .populate('createdBy', 'name email')
          .populate('updatedBy', 'name email')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Customer.countDocuments(filter)
      ]);

      return {
        customers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    }

    // Default fast lookup (e.g. for POS dropdowns)
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
    const customers = await Customer.find(filter)
      .sort(sort)
      .limit(limit)
      .lean();

    return customers;
  }

  /**
   * Get single customer by ID
   */
  async getCustomerById(organizationId, customerId) {
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      throw new AppError('Invalid customer ID format', 400, 'INVALID_CUSTOMER_ID');
    }

    const customer = await Customer.findOne({
      _id: customerId,
      organizationId
    })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    if (!customer) {
      throw new AppError('Customer not found in this organization', 404, 'CUSTOMER_NOT_FOUND');
    }

    return customer;
  }

  /**
   * Create new customer
   */
  async createCustomer(organizationId, userId, customerData) {
    const openingBalance = Number(customerData.openingBalance) || 0;

    // Validate phone uniqueness within organization if phone is provided
    if (customerData.phone && customerData.phone.trim()) {
      const existing = await Customer.findOne({
        organizationId,
        phone: customerData.phone.trim()
      });
      if (existing) {
        throw new AppError(
          'Customer with this phone number already exists in this organization',
          409,
          'CUSTOMER_PHONE_EXISTS'
        );
      }
    }

    const customer = new Customer({
      ...customerData,
      organizationId,
      openingBalance,
      outstandingBalance: openingBalance,
      creditBalance: openingBalance,
      createdBy: userId
    });

    return await customer.save();
  }

  /**
   * Update existing customer
   */
  async updateCustomer(organizationId, customerId, userId, updateData) {
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      throw new AppError('Invalid customer ID format', 400, 'INVALID_CUSTOMER_ID');
    }

    // Check phone uniqueness if phone is updated
    if (updateData.phone && updateData.phone.trim()) {
      const duplicatePhone = await Customer.findOne({
        _id: { $ne: customerId },
        organizationId,
        phone: updateData.phone.trim()
      });
      if (duplicatePhone) {
        throw new AppError(
          'Another customer with this phone number already exists in this organization',
          409,
          'CUSTOMER_PHONE_EXISTS'
        );
      }
    }

    // Sync creditBalance if outstandingBalance is modified
    if (updateData.outstandingBalance !== undefined) {
      updateData.creditBalance = updateData.outstandingBalance;
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: customerId, organizationId },
      {
        ...updateData,
        updatedBy: userId
      },
      { new: true, runValidators: true }
    );

    if (!customer) {
      throw new AppError('Customer not found in this organization', 404, 'CUSTOMER_NOT_FOUND');
    }

    return customer;
  }

  /**
   * Safe delete or deactivation
   */
  async deleteCustomer(organizationId, customerId) {
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      throw new AppError('Invalid customer ID format', 400, 'INVALID_CUSTOMER_ID');
    }

    const customer = await Customer.findOne({ _id: customerId, organizationId });
    if (!customer) {
      throw new AppError('Customer not found in this organization', 404, 'CUSTOMER_NOT_FOUND');
    }

    // Check if customer has associated sales
    const salesCount = await Sale.countDocuments({
      organizationId,
      'customer.customerId': customerId
    });

    if (salesCount > 0) {
      // Soft-deactivate to protect financial and sales audit trail
      customer.status = 'INACTIVE';
      await customer.save();
      return {
        deactivated: true,
        message: 'Customer has associated sales records and was deactivated instead of deleted'
      };
    }

    await Customer.deleteOne({ _id: customerId, organizationId });
    return {
      deactivated: false,
      message: 'Customer deleted successfully'
    };
  }

  /**
   * Record payment from customer towards outstanding balance
   */
  async recordCustomerPayment(organizationId, customerId, userId, paymentData) {
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      throw new AppError('Invalid customer ID format', 400, 'INVALID_CUSTOMER_ID');
    }

    const customer = await Customer.findOne({ _id: customerId, organizationId });
    if (!customer) {
      throw new AppError('Customer not found in this organization', 404, 'CUSTOMER_NOT_FOUND');
    }

    const amount = Number(paymentData.amount);
    if (!amount || amount <= 0) {
      throw new AppError('Payment amount must be greater than zero', 400, 'INVALID_AMOUNT');
    }

    const receiptNumber = `RCP-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const payment = new CustomerPayment({
      organizationId,
      customerId,
      receiptNumber,
      paymentDate: paymentData.paymentDate || new Date(),
      amount,
      paymentMethod: paymentData.paymentMethod || 'CASH',
      notes: paymentData.notes ? paymentData.notes.trim() : '',
      receivedBy: userId
    });

    await payment.save();

    // Deduct outstanding balance and credit balance atomically
    const updatedCustomer = await Customer.findOneAndUpdate(
      { _id: customerId, organizationId },
      {
        $inc: {
          outstandingBalance: -amount,
          creditBalance: -amount,
          totalPaid: amount
        },
        $set: { updatedBy: userId }
      },
      { new: true }
    );

    return {
      payment,
      customer: updatedCustomer
    };
  }

  /**
   * Get customer summary statistics
   */
  async getCustomerSummary(organizationId, customerId) {
    const customer = await this.getCustomerById(organizationId, customerId);

    const salesAgg = await Sale.aggregate([
      {
        $match: {
          organizationId: new mongoose.Types.ObjectId(organizationId.toString()),
          'customer.customerId': new mongoose.Types.ObjectId(customerId.toString()),
          status: { $ne: 'VOIDED' }
        }
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: '$grandTotal' },
          totalOrders: { $sum: 1 },
          lastOrderDate: { $max: '$createdAt' }
        }
      }
    ]);

    const summary = salesAgg[0] || {
      totalSpent: customer.totalSpent || 0,
      totalOrders: customer.totalVisits || 0,
      lastOrderDate: null
    };

    return {
      customerId: customer._id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      totalSpent: summary.totalSpent,
      totalPurchases: summary.totalSpent,
      totalPaid: customer.totalPaid || 0,
      outstandingBalance: customer.outstandingBalance || 0,
      creditLimit: customer.creditLimit || 0,
      totalOrders: summary.totalOrders,
      lastOrderDate: summary.lastOrderDate,
      loyaltyPoints: customer.loyaltyPoints || 0
    };
  }

  /**
   * Get customer sales history
   */
  async getCustomerSales(organizationId, customerId, query = {}) {
    await this.getCustomerById(organizationId, customerId);

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {
      organizationId: new mongoose.Types.ObjectId(organizationId.toString()),
      'customer.customerId': new mongoose.Types.ObjectId(customerId.toString())
    };

    const [sales, total] = await Promise.all([
      Sale.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Sale.countDocuments(filter)
    ]);

    return {
      sales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get customer payment receipts history
   */
  async getCustomerPayments(organizationId, customerId, query = {}) {
    await this.getCustomerById(organizationId, customerId);

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {
      organizationId: new mongoose.Types.ObjectId(organizationId.toString()),
      customerId: new mongoose.Types.ObjectId(customerId.toString())
    };

    const [payments, total] = await Promise.all([
      CustomerPayment.find(filter)
        .populate('receivedBy', 'name email')
        .sort({ paymentDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CustomerPayment.countDocuments(filter)
    ]);

    return {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get complete customer ledger combining sales & payments
   */
  async getCustomerLedger(organizationId, customerId) {
    const customer = await this.getCustomerById(organizationId, customerId);

    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    const cId = new mongoose.Types.ObjectId(customerId.toString());

    const [sales, payments] = await Promise.all([
      Sale.find({
        organizationId: orgId,
        'customer.customerId': cId,
        status: { $ne: 'VOIDED' }
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      CustomerPayment.find({
        organizationId: orgId,
        customerId: cId
      })
        .sort({ paymentDate: -1 })
        .limit(30)
        .lean()
    ]);

    const ledgerEntries = [];

    // Map sales: Customer account is debited
    for (const s of sales) {
      ledgerEntries.push({
        date: s.createdAt,
        reference: s.invoiceNumber,
        type: 'SALE',
        paymentMethod: s.paymentMethod,
        debit: s.grandTotal,
        credit: s.paymentMethod === 'CREDIT' ? 0 : s.grandTotal,
        notes: s.notes || (s.paymentMethod === 'CREDIT' ? 'Credit Sale' : 'Paid in full')
      });
    }

    // Map payments: Customer account is credited
    for (const p of payments) {
      ledgerEntries.push({
        date: p.paymentDate || p.createdAt,
        reference: p.receiptNumber,
        type: 'PAYMENT',
        paymentMethod: p.paymentMethod,
        debit: 0,
        credit: p.amount,
        notes: p.notes || 'Balance payment received'
      });
    }

    // Sort combined entries by date descending
    ledgerEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        outstandingBalance: customer.outstandingBalance || 0,
        creditLimit: customer.creditLimit || 0
      },
      ledger: ledgerEntries
    };
  }
}

module.exports = new CustomerService();
