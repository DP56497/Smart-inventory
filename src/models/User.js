const mongoose = require('mongoose');
const { ROLES, ALL_ROLES } = require('../constants/roles');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'User email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    password: {
      type: String,
      required: [true, 'Password is required']
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'User must belong to an Organization'],
      index: true
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.OWNER,
      index: true
    },
    refreshToken: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true
    },
    passwordResetToken: {
      type: String,
      default: null,
      index: true
    },
    passwordResetExpires: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound index for fast tenant-scoped user lookups
userSchema.index({ organizationId: 1, email: 1 });
userSchema.index({ organizationId: 1, role: 1 });

module.exports = mongoose.model('User', userSchema);
