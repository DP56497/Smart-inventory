const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      maxlength: [100, 'Organization name cannot exceed 100 characters']
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner ID is required'],
      index: true
    },
    email: {
      type: String,
      required: [true, 'Organization contact email is required'],
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      street: { type: String, trim: true, default: '' },
      city: { type: String, trim: true, default: '' },
      state: { type: String, trim: true, default: '' },
      postalCode: { type: String, trim: true, default: '' },
      country: { type: String, trim: true, default: 'India' }
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: ''
    },
    logo: {
      type: String,
      default: ''
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
      trim: true
    },
    taxSettings: {
      enableGst: {
        type: Boolean,
        default: true
      },
      defaultTaxRate: {
        type: Number,
        default: 18,
        min: 0,
        max: 100
      },
      cgstRate: {
        type: Number,
        default: 9,
        min: 0,
        max: 100
      },
      sgstRate: {
        type: Number,
        default: 9,
        min: 0,
        max: 100
      },
      igstRate: {
        type: Number,
        default: 18,
        min: 0,
        max: 100
      }
    },
    inventorySettings: {
      enableNegativeInventory: {
        type: Boolean,
        default: false
      },
      lowStockAlertThreshold: {
        type: Number,
        default: 10,
        min: 0
      },
      allowBackorders: {
        type: Boolean,
        default: false
      },
      defaultUnit: {
        type: String,
        default: 'PCS',
        uppercase: true,
        trim: true
      }
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Helpful compound index for fast tenant resolution
organizationSchema.index({ slug: 1, status: 1 });

module.exports = mongoose.model('Organization', organizationSchema);
