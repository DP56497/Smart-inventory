const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Unit name is required'],
      trim: true,
      maxlength: [50, 'Unit name cannot exceed 50 characters']
    },
    code: {
      type: String,
      required: [true, 'Unit code is required'],
      trim: true,
      uppercase: true,
      maxlength: [20, 'Unit code cannot exceed 20 characters']
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required'],
      index: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: true
  }
);

// Enforce unit code uniqueness per organization
unitSchema.index({ organizationId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Unit', unitSchema);
