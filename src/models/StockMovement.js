const mongoose = require('mongoose');

const STOCK_MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'SALE_RETURN',
  'PURCHASE_RETURN',
  'DAMAGE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT'
];

const stockMovementSchema = new mongoose.Schema(
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
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID is required'],
      index: true
    },
    type: {
      type: String,
      enum: {
        values: STOCK_MOVEMENT_TYPES,
        message: '{VALUE} is not a valid stock movement type'
      },
      required: [true, 'Movement type is required'],
      index: true
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0.0001, 'Quantity must be greater than 0']
    },
    previousStock: {
      type: Number,
      required: [true, 'Previous stock is required']
    },
    newStock: {
      type: Number,
      required: [true, 'New stock is required']
    },
    referenceId: {
      type: String,
      default: null,
      trim: true
    },
    referenceType: {
      type: String,
      default: 'MANUAL_ADJUSTMENT',
      trim: true
    },
    reason: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Reason cannot exceed 500 characters']
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created by user ID is required']
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

// High-efficiency compound indices for multi-tenant querying
stockMovementSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });
stockMovementSchema.index({ organizationId: 1, type: 1, createdAt: -1 });
stockMovementSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
module.exports.STOCK_MOVEMENT_TYPES = STOCK_MOVEMENT_TYPES;
