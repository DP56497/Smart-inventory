const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID is required']
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true
    },
    SKU: {
      type: String,
      required: [true, 'Product SKU is required'],
      trim: true,
      uppercase: true
    },
    unit: {
      type: String,
      default: 'PCS'
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0.0001, 'Quantity must be positive']
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative']
    },
    purchasePrice: {
      type: Number,
      default: 0
    },
    taxPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required'],
      index: true
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true
    },
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      uppercase: true,
      trim: true
    },
    customer: {
      customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        default: null
      },
      name: {
        type: String,
        default: 'Walk-in Customer',
        trim: true
      },
      phone: {
        type: String,
        default: '',
        trim: true
      }
    },
    items: {
      type: [saleItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'A sale must have at least one line item'
      }
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    totalTax: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    discountType: {
      type: String,
      enum: ['PERCENTAGE', 'FIXED', 'NONE'],
      default: 'NONE'
    },
    discountValue: {
      type: Number,
      default: 0,
      min: 0
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'UPI', 'CARD', 'CREDIT'],
      required: [true, 'Payment method is required']
    },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'PARTIALLY_PAID', 'PENDING'],
      default: 'PAID'
    },
    amountReceived: {
      type: Number,
      default: 0,
      min: 0
    },
    changeReturned: {
      type: Number,
      default: 0,
      min: 0
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'VOIDED', 'REFUNDED'],
      default: 'COMPLETED',
      index: true
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: null,
      index: true
    },
    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Cashier ID is required']
    }
  },
  {
    timestamps: true
  }
);

// Organization-scoped unique invoice numbers
saleSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });

// Organization-scoped idempotency index to prevent double submission
saleSchema.index(
  { organizationId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } } }
);

// High-speed sorting & filtering indices
saleSchema.index({ organizationId: 1, createdAt: -1 });
saleSchema.index({ organizationId: 1, paymentMethod: 1 });
saleSchema.index({ organizationId: 1, 'customer.customerId': 1 });

module.exports = mongoose.model('Sale', saleSchema);
