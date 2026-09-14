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

const stockAdjustmentSchema = z.object({
  productId: z.string().regex(objectIdRegex, 'Invalid product ID format'),
  type: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'], {
    errorMap: () => ({ message: "Type must be either 'ADJUSTMENT_IN' or 'ADJUSTMENT_OUT'" })
  }),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  reason: z
    .string()
    .trim()
    .min(1, 'Reason is required')
    .max(500, 'Reason cannot exceed 500 characters'),
  referenceId: z.string().trim().optional().default('')
});

const inventoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  status: z.enum(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'OVER_STOCK']).default('ALL'),
  categoryId: optionalObjectId.optional(),
  brandId: optionalObjectId.optional(),
  sortBy: z.enum(['name', 'SKU', 'currentStock', 'sellingPrice', 'purchasePrice', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

const movementQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  productId: optionalObjectId.optional(),
  type: z
    .enum([
      'ALL',
      'PURCHASE',
      'SALE',
      'SALE_RETURN',
      'PURCHASE_RETURN',
      'DAMAGE',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'TRANSFER_IN',
      'TRANSFER_OUT'
    ])
    .default('ALL'),
  search: z.string().trim().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

module.exports = {
  stockAdjustmentSchema,
  inventoryQuerySchema,
  movementQuerySchema
};
