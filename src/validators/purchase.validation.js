const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const optionalObjectId = z
  .union([
    z.string().regex(objectIdRegex, 'Invalid ID format'),
    z.literal(''),
    z.null(),
    z.undefined()
  ])
  .transform((val) => (val === '' ? null : val));

const purchaseItemInputSchema = z.object({
  productId: z.string().regex(objectIdRegex, 'Invalid product ID format'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unitCost: z.coerce.number().min(0, 'Unit cost cannot be negative'),
  taxPercentage: z.coerce.number().min(0).max(100).default(0)
});

const createPurchaseSchema = z.object({
  purchaseNumber: z.string().trim().max(50).optional(),
  supplierId: optionalObjectId.optional(),
  items: z.array(purchaseItemInputSchema).min(1, 'Purchase must have at least one line item'),
  paidAmount: z.coerce.number().min(0).optional(),
  paymentStatus: z.enum(['PAID', 'PARTIALLY_PAID', 'PENDING']).default('PAID'),
  status: z.enum(['RECEIVED', 'ORDERED']).default('RECEIVED'),
  notes: z.string().trim().max(1000).optional().default('')
});

const updatePurchaseStatusSchema = z.object({
  status: z.enum(['RECEIVED', 'ORDERED', 'CANCELLED'], {
    errorMap: () => ({ message: "Status must be 'RECEIVED', 'ORDERED', or 'CANCELLED'" })
  }),
  notes: z.string().trim().max(1000).optional().default('')
});

const purchaseQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  supplierId: optionalObjectId.optional(),
  status: z.enum(['ALL', 'RECEIVED', 'ORDERED', 'CANCELLED']).default('ALL'),
  paymentStatus: z.enum(['ALL', 'PAID', 'PARTIALLY_PAID', 'PENDING']).default('ALL'),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

module.exports = {
  createPurchaseSchema,
  updatePurchaseStatusSchema,
  purchaseQuerySchema
};
