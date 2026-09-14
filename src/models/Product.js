const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Product name cannot exceed 200 characters'],
      index: true
    },
    SKU: {
      type: String,
      required: [true, 'Product SKU is required'],
      trim: true,
      uppercase: true,
      maxlength: [100, 'SKU cannot exceed 100 characters']
    },
    barcode: {
      type: String,
      trim: true,
      default: '',
      maxlength: [100, 'Barcode cannot exceed 100 characters']
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
      index: true
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      default: null,
      index: true
    },
    purchasePrice: {
      type: Number,
      required: [true, 'Purchase price is required'],
      min: [0, 'Purchase price cannot be negative'],
      default: 0
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price is required'],
      min: [0, 'Selling price cannot be negative'],
      default: 0
    },
    taxPercentage: {
      type: Number,
      min: [0, 'Tax percentage cannot be negative'],
      max: [100, 'Tax percentage cannot exceed 100'],
      default: 0
    },
    currentStock: {
      type: Number,
      default: 0,
      min: [0, 'Current stock cannot be negative']
    },
    minimumStock: {
      type: Number,
      default: 0,
      min: [0, 'Minimum stock cannot be negative']
    },
    maximumStock: {
      type: Number,
      default: 0,
      min: [0, 'Maximum stock cannot be negative']
    },
    reorderLevel: {
      type: Number,
      default: 0,
      min: [0, 'Reorder level cannot be negative']
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    images: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required'],
      index: true
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Created by user ID is required']
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Organization-scoped uniqueness
productSchema.index({ organizationId: 1, SKU: 1 }, { unique: true });

// Sparse index on barcode per organization: only enforce uniqueness when barcode is non-empty
productSchema.index(
  { organizationId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } }
);

// High performance filter and sorting indices
productSchema.index({ organizationId: 1, status: 1 });
productSchema.index({ organizationId: 1, categoryId: 1 });
productSchema.index({ organizationId: 1, brandId: 1 });
productSchema.index({ organizationId: 1, currentStock: 1 });
productSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
