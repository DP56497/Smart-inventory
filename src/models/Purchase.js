const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    SKU: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.0001
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    taxPercentage: {
      type: Number,
      default: 0,
      min: 0
    },
    taxAmount: {
      type: Number,
      default: 0,
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

const purchaseSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required'],
      index: true
    },
    purchaseNumber: {
      type: String,
      required: [true, 'Purchase order / bill number is required'],
      trim: true,
      uppercase: true
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
      index: true
    },
    items: {
      type: [purchaseItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Purchase must contain at least one line item'
      }
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    totalTax: {
      type: Number,
      default: 0,
      min: 0
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'PARTIALLY_PAID', 'PENDING'],
      default: 'PAID'
    },
    status: {
      type: String,
      enum: ['RECEIVED', 'ORDERED', 'CANCELLED'],
      default: 'RECEIVED',
      index: true
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

purchaseSchema.index({ organizationId: 1, purchaseNumber: 1 }, { unique: true });
purchaseSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('Purchase', purchaseSchema);
