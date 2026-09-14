const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const StockMovement = require('../models/StockMovement');
const inventoryService = require('./inventory.service');
const AppError = require('../utils/AppError');
const { ROLES } = require('../constants/roles');

class PosService {
  /**
   * Generates a clean, human-readable, unique invoice number: INV-YYYYMMDD-XXXX
   */
  async generateInvoiceNumber(organizationId, session = null) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const datePrefix = `INV-${year}${month}${day}`;

    // Find highest invoice number for today within this tenant
    const startOfDay = new Date(year, today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfDay = new Date(year, today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const query = Sale.find({
      organizationId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    })
      .sort({ createdAt: -1 })
      .limit(1);

    if (session) query.session(session);
    const lastSale = await query.lean();

    let seq = 1;
    if (lastSale && lastSale.length > 0 && lastSale[0].invoiceNumber) {
      const parts = lastSale[0].invoiceNumber.split('-');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          seq = lastSeq + 1;
        }
      }
    }

    const paddedSeq = String(seq).padStart(4, '0');
    return `${datePrefix}-${paddedSeq}`;
  }

  /**
   * Validates discount limits against user role permissions
   */
  validateDiscountPermissions(userRole, discountType, discountValue, subtotal) {
    if (!discountType || discountType === 'NONE' || !discountValue || discountValue <= 0) {
      return;
    }

    const numericValue = Number(discountValue);

    // CASHIER role has a strictly enforced maximum 15% discount limit
    if (userRole === ROLES.CASHIER) {
      if (discountType === 'PERCENTAGE' && numericValue > 15) {
        throw new AppError(
          'Cashiers cannot apply discounts greater than 15%. Manager authorization required.',
          403,
          'DISCOUNT_LIMIT_EXCEEDED'
        );
      }

      if (discountType === 'FIXED') {
        const maxAllowedFixed = Math.round((subtotal * 15) / 100);
        if (numericValue > maxAllowedFixed) {
          throw new AppError(
            `Cashiers cannot apply fixed discounts exceeding 15% of subtotal (Max: ₹${maxAllowedFixed}). Manager authorization required.`,
            403,
            'DISCOUNT_LIMIT_EXCEEDED'
          );
        }
      }
    }
  }

  /**
   * Process a complete retail sale atomically:
   * 1. Check idempotency
   * 2. Validate product availability & server-authoritative prices
   * 3. Compute line items, subtotal, tax, and discounts
   * 4. Enforce cashier discount restrictions
   * 5. Atomically decrease stock & record StockMovement entries
   * 6. Record Sale & update customer statistics
   */
  async processCheckout({ organizationId, user, checkoutData }) {
    const {
      items,
      customerId,
      customerName = 'Walk-in Customer',
      customerPhone = '',
      discountType = 'NONE',
      discountValue = 0,
      paymentMethod,
      amountReceived = 0,
      idempotencyKey,
      notes = ''
    } = checkoutData;

    // 1. Check Idempotency: Prevent duplicate submissions
    if (idempotencyKey && idempotencyKey.trim()) {
      const existingSale = await Sale.findOne({
        organizationId,
        idempotencyKey: idempotencyKey.trim()
      })
        .populate('cashier', 'name email role')
        .populate('customer.customerId', 'name phone email creditBalance')
        .lean();

      if (existingSale) {
        return {
          sale: existingSale,
          isDuplicate: true,
          message: 'Sale previously processed (idempotent result)'
        };
      }
    }

    // 2. Validate line items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError('Cart must contain at least one product', 400, 'EMPTY_CART');
    }

    // Aggregate duplicate product entries if cashier scanned the same item multiple times
    const aggregatedItemsMap = new Map();
    for (const item of items) {
      const pId = item.productId.toString();
      const qty = Number(item.quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new AppError('Item quantity must be a positive number', 400, 'INVALID_QUANTITY');
      }
      aggregatedItemsMap.set(pId, (aggregatedItemsMap.get(pId) || 0) + qty);
    }

    const uniqueProductIds = Array.from(aggregatedItemsMap.keys());

    // 3. Customer validation for Credit payment
    let customerDoc = null;
    if (customerId) {
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        throw new AppError('Invalid customer ID format', 400, 'INVALID_CUSTOMER_ID');
      }
      customerDoc = await Customer.findOne({ _id: customerId, organizationId });
      if (!customerDoc) {
        throw new AppError('Customer not found in this organization', 404, 'CUSTOMER_NOT_FOUND');
      }
    }

    if (paymentMethod === 'CREDIT' && !customerDoc) {
      throw new AppError(
        'A registered customer account is required for credit sales',
        400,
        'CUSTOMER_REQUIRED_FOR_CREDIT'
      );
    }

    // Execute within database transaction
    return await inventoryService.withSessionTransaction(async (session) => {
      // 4. Fetch authoritative product records locked to tenant
      const productQuery = Product.find({
        _id: { $in: uniqueProductIds },
        organizationId
      }).populate('unitId', 'name code');

      if (session) productQuery.session(session);
      const products = await productQuery;

      if (products.length !== uniqueProductIds.length) {
        throw new AppError(
          'One or more products in cart were not found or do not belong to this organization',
          404,
          'PRODUCTS_NOT_FOUND'
        );
      }

      const productMap = new Map(products.map((p) => [p._id.toString(), p]));

      // 5. Verify availability and calculate authoritative line items
      const lineItems = [];
      let calculatedSubtotal = 0;
      let calculatedBaseTax = 0;

      for (const [pId, requestedQty] of aggregatedItemsMap.entries()) {
        const product = productMap.get(pId);

        if (product.status !== 'ACTIVE') {
          throw new AppError(
            `Product '${product.name}' is inactive and cannot be sold`,
            400,
            'PRODUCT_INACTIVE'
          );
        }

        if (product.currentStock < requestedQty) {
          throw new AppError(
            `Insufficient stock for '${product.name}'. Available: ${product.currentStock}, Requested: ${requestedQty}`,
            400,
            'INSUFFICIENT_STOCK'
          );
        }

        const unitPrice = Number(product.sellingPrice) || 0;
        const purchasePrice = Number(product.purchasePrice) || 0;
        const taxPercentage = Number(product.taxPercentage) || 0;

        const itemSubtotal = Math.round(unitPrice * requestedQty * 100) / 100;
        const itemTax = Math.round(((itemSubtotal * taxPercentage) / 100) * 100) / 100;
        const itemTotal = Math.round((itemSubtotal + itemTax) * 100) / 100;

        calculatedSubtotal += itemSubtotal;
        calculatedBaseTax += itemTax;

        lineItems.push({
          productId: product._id,
          name: product.name,
          SKU: product.SKU,
          unit: product.unitId?.code || 'PCS',
          quantity: requestedQty,
          unitPrice,
          purchasePrice,
          taxPercentage,
          taxAmount: itemTax,
          subtotal: itemSubtotal,
          total: itemTotal
        });
      }

      calculatedSubtotal = Math.round(calculatedSubtotal * 100) / 100;
      calculatedBaseTax = Math.round(calculatedBaseTax * 100) / 100;

      // 6. Validate discount permissions and compute discount amount
      this.validateDiscountPermissions(user.role, discountType, discountValue, calculatedSubtotal);

      let discountAmount = 0;
      const val = Number(discountValue) || 0;
      if (discountType === 'PERCENTAGE' && val > 0) {
        discountAmount = Math.round(((calculatedSubtotal * val) / 100) * 100) / 100;
      } else if (discountType === 'FIXED' && val > 0) {
        discountAmount = Math.round(val * 100) / 100;
      }
      discountAmount = Math.min(calculatedSubtotal, discountAmount);

      // Tax adjusted proportionally if discount applied
      const taxRatio = calculatedSubtotal > 0 ? (calculatedSubtotal - discountAmount) / calculatedSubtotal : 1;
      const totalTax = Math.round(calculatedBaseTax * taxRatio * 100) / 100;

      // Calculate final Grand Total
      const grandTotal = Math.max(0, Math.round((calculatedSubtotal - discountAmount + totalTax) * 100) / 100);

      // 7. Payment calculation
      let calculatedReceived = Number(amountReceived) || 0;
      let changeReturned = 0;
      let paymentStatus = 'PAID';

      if (paymentMethod === 'CASH') {
        calculatedReceived = Math.round(calculatedReceived * 100) / 100;
        if (calculatedReceived < grandTotal) {
          throw new AppError(
            `Cash received (₹${calculatedReceived}) is less than total amount due (₹${grandTotal})`,
            400,
            'INSUFFICIENT_PAYMENT'
          );
        }
        changeReturned = Math.max(0, Math.round((calculatedReceived - grandTotal) * 100) / 100);
      } else if (paymentMethod === 'CREDIT') {
        calculatedReceived = 0;
        changeReturned = 0;
        paymentStatus = 'PENDING';
      } else {
        // UPI, CARD
        calculatedReceived = grandTotal;
        changeReturned = 0;
        paymentStatus = 'PAID';
      }

      // 8. Generate unique invoice number
      const invoiceNumber = await this.generateInvoiceNumber(organizationId, session);

      // 9. Atomic Stock Deduction & StockMovement Audit records
      for (const item of lineItems) {
        const product = productMap.get(item.productId.toString());
        const previousStock = product.currentStock;
        const newStock = previousStock - item.quantity;

        // Atomically decrease product stock with conditional guard
        const updateResult = await Product.findOneAndUpdate(
          {
            _id: item.productId,
            organizationId,
            currentStock: { $gte: item.quantity }
          },
          {
            $inc: { currentStock: -item.quantity },
            $set: { updatedBy: user.id }
          },
          { new: true, session }
        );

        if (!updateResult) {
          throw new AppError(
            `Stock conflict for product '${item.name}'. Insufficient stock available.`,
            409,
            'STOCK_CONFLICT'
          );
        }

        // Create audit movement
        const movement = new StockMovement({
          organizationId,
          productId: item.productId,
          type: 'SALE',
          quantity: item.quantity,
          previousStock,
          newStock,
          referenceId: invoiceNumber,
          referenceType: 'POS_SALE',
          reason: `POS Sale invoice ${invoiceNumber}`,
          createdBy: user.id
        });

        if (session) {
          await movement.save({ session });
        } else {
          await movement.save();
        }
      }

      // 10. Update Customer statistics & ledger
      if (customerDoc) {
        const updateFields = {
          $inc: {
            totalSpent: grandTotal,
            totalVisits: 1
          }
        };

        if (paymentMethod === 'CREDIT') {
          updateFields.$inc.creditBalance = grandTotal;
        }

        if (session) {
          await Customer.updateOne({ _id: customerDoc._id }, updateFields, { session });
        } else {
          await Customer.updateOne({ _id: customerDoc._id }, updateFields);
        }
      }

      // 11. Create Sale Record
      const sale = new Sale({
        organizationId,
        invoiceNumber,
        customer: {
          customerId: customerDoc ? customerDoc._id : null,
          name: customerDoc ? customerDoc.name : (customerName || 'Walk-in Customer'),
          phone: customerDoc ? customerDoc.phone : (customerPhone || '')
        },
        items: lineItems,
        subtotal: calculatedSubtotal,
        totalTax,
        discountType,
        discountValue: Number(discountValue) || 0,
        discountAmount,
        grandTotal,
        paymentMethod,
        paymentStatus,
        amountReceived: calculatedReceived,
        changeReturned,
        notes: notes ? notes.trim() : '',
        idempotencyKey: idempotencyKey ? idempotencyKey.trim() : null,
        cashier: user.id,
        status: 'COMPLETED'
      });

      let savedSale;
      if (session) {
        savedSale = await sale.save({ session });
      } else {
        savedSale = await sale.save();
      }

      const populatedSale = await Sale.findById(savedSale._id)
        .populate('cashier', 'name email role')
        .populate('customer.customerId', 'name phone email creditBalance')
        .lean();

      return {
        sale: populatedSale,
        isDuplicate: false,
        message: 'Sale completed successfully'
      };
    });
  }

  /**
   * Retrieves paginated sales history with filtering
   */
  async getSales(organizationId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 15));
    const skip = (page - 1) * limit;

    const filter = {
      organizationId: new mongoose.Types.ObjectId(organizationId.toString())
    };

    // Filter by payment method
    if (query.paymentMethod && query.paymentMethod !== 'ALL') {
      filter.paymentMethod = query.paymentMethod;
    }

    // Filter by status
    if (query.status && query.status !== 'ALL') {
      filter.status = query.status;
    }

    // Filter by date range
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) {
        filter.createdAt.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // Search by invoice number or customer name/phone
    if (query.search && query.search.trim()) {
      const searchRegex = { $regex: query.search.trim(), $options: 'i' };
      filter.$or = [
        { invoiceNumber: searchRegex },
        { 'customer.name': searchRegex },
        { 'customer.phone': searchRegex }
      ];
    }

    const [sales, total] = await Promise.all([
      Sale.find(filter)
        .populate('cashier', 'name email')
        .populate('customer.customerId', 'name phone creditBalance')
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
   * Retrieves a single sale by ID for receipt viewing / reprinting
   */
  async getSaleById(organizationId, saleId) {
    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      throw new AppError('Invalid sale ID format', 400, 'INVALID_SALE_ID');
    }

    const sale = await Sale.findOne({
      _id: saleId,
      organizationId
    })
      .populate('cashier', 'name email role')
      .populate('customer.customerId', 'name phone email address creditBalance')
      .lean();

    if (!sale) {
      throw new AppError('Sale record not found', 404, 'SALE_NOT_FOUND');
    }

    return sale;
  }

  /**
   * Fast POS product search with stock quantities and barcode indexing
   */
  async searchPosProducts(organizationId, query = {}) {
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 30));
    const filter = {
      organizationId: new mongoose.Types.ObjectId(organizationId.toString()),
      status: 'ACTIVE'
    };

    if (query.categoryId) {
      filter.categoryId = new mongoose.Types.ObjectId(query.categoryId.toString());
    }

    if (query.barcode && query.barcode.trim()) {
      // Exact barcode match takes precedence
      filter.barcode = query.barcode.trim();
    } else if (query.search && query.search.trim()) {
      const searchRegex = { $regex: query.search.trim(), $options: 'i' };
      filter.$or = [
        { name: searchRegex },
        { SKU: searchRegex },
        { barcode: searchRegex }
      ];
    }

    const products = await Product.find(filter)
      .populate('categoryId', 'name')
      .populate('unitId', 'name code')
      .select('name SKU barcode sellingPrice currentStock taxPercentage unitId categoryId images')
      .sort({ currentStock: -1, name: 1 })
      .limit(limit)
      .lean();

    return products;
  }
}

module.exports = new PosService();
