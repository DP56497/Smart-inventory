const mongoose = require('mongoose');

const customerPaymentSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization ID is required'],
      index: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true
    },
    receiptNumber: {
      type: String,
      required: [true, 'Receipt number is required'],
      uppercase: true,
      trim: true
    },
    paymentDate: {
      type: Date,
      default: Date.now
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0.01, 'Payment amount must be greater than zero']
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'],
      default: 'CASH'
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Notes cannot exceed 500 characters']
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for fast lookups
customerPaymentSchema.index({ organizationId: 1, customerId: 1, paymentDate: -1 });
customerPaymentSchema.index({ organizationId: 1, receiptNumber: 1 });
customerPaymentSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('CustomerPayment', customerPaymentSchema);
