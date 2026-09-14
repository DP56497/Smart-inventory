const { z } = require('zod');

const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(150),
  phone: z.string().trim().max(30).optional().default(''),
  email: z.string().trim().email('Invalid email address').or(z.literal('')).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
  city: z.string().trim().max(100).optional().default(''),
  state: z.string().trim().max(100).optional().default(''),
  pincode: z.string().trim().max(20).optional().default(''),
  gstin: z.string().trim().max(20).optional().default(''),
  openingBalance: z.coerce.number().optional().default(0),
  creditLimit: z.coerce.number().min(0, 'Credit limit cannot be negative').optional().default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
});

const updateCustomerSchema = createCustomerSchema.partial();

const customerQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).default('ALL'),
  hasBalance: z.enum(['ALL', 'YES', 'NO']).default('ALL'),
  sortBy: z.enum(['name', 'createdAt', 'totalSpent', 'outstandingBalance']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

const recordCustomerPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']).default('CASH'),
  notes: z.string().trim().max(500).optional().default(''),
  paymentDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional()
});

module.exports = {
  createCustomerSchema,
  updateCustomerSchema,
  customerQuerySchema,
  recordCustomerPaymentSchema
};
