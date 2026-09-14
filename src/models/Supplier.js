const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required'],
      index: true
    },
    name: {
      type: String,
      required: [true, 'Supplier contact name is required'],
      trim: true,
      maxlength: [150, 'Supplier name cannot exceed 150 characters']
    },
    companyName: {
      type: String,
      trim: true,
      default: '',
      maxlength: [150, 'Company name cannot exceed 150 characters']
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      maxlength: [150, 'Email cannot exceed 150 characters']
    },
    phone: {
      type: String,
      trim: true,
      default: '',
      maxlength: [30, 'Phone cannot exceed 30 characters']
    },
    address: {
      type: String,
      trim: true,
      default: '',
      maxlength: [300, 'Address cannot exceed 300 characters']
    },
    city: {
      type: String,
      trim: true,
      default: '',
      maxlength: [100, 'City cannot exceed 100 characters']
    },
    state: {
      type: String,
      trim: true,
      default: '',
      maxlength: [100, 'State cannot exceed 100 characters']
    },
    pincode: {
      type: String,
      trim: true,
      default: '',
      maxlength: [20, 'Pincode cannot exceed 20 characters']
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
      maxlength: [20, 'GSTIN cannot exceed 20 characters']
    },
    openingBalance: {
      type: Number,
      default: 0
    },
    creditLimit: {
      type: Number,
      default: 0,
      min: 0
    },
    totalPurchases: {
      type: Number,
      default: 0,
      min: 0
    },
    totalPaid: {
      type: Number,
      default: 0,
      min: 0
    },
    outstandingPayable: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
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

// Compound indexes for high-speed scoped search and filtering
supplierSchema.index({ organizationId: 1, phone: 1 });
supplierSchema.index({ organizationId: 1, name: 1 });
supplierSchema.index({ organizationId: 1, companyName: 1 });
supplierSchema.index({ organizationId: 1, status: 1 });
supplierSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('Supplier', supplierSchema);
