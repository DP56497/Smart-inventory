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

const cartItemSchema = z.object({
  productId: z.string().regex(objectIdRegex, 'Invalid product ID format'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0')
});

const checkoutSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'Cart must contain at least one item'),
  customerId: optionalObjectId.optional(),
  customerName: z.string().trim().max(150).optional().default('Walk-in Customer'),
  customerPhone: z.string().trim().max(30).optional().default(''),
  discountType: z.enum(['PERCENTAGE', 'FIXED', 'NONE']).default('NONE'),
  discountValue: z.coerce.number().min(0, 'Discount cannot be negative').default(0),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'CREDIT'], {
    errorMap: () => ({ message: 'Payment method must be CASH, UPI, CARD, or CREDIT' })
  }),
  amountReceived: z.coerce.number().min(0, 'Amount received cannot be negative').default(0),
  idempotencyKey: z.string().trim().optional(),
  notes: z.string().trim().max(500).optional().default('')
});

const customerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required').max(150),
  phone: z.string().trim().max(30).optional().default(''),
  email: z.string().trim().email('Invalid email address').or(z.literal('')).optional().default(''),
  address: z.string().trim().max(300).optional().default('')
});

const saleQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(15),
  search: z.string().trim().optional(),
  paymentMethod: z.enum(['ALL', 'CASH', 'UPI', 'CARD', 'CREDIT']).default('ALL'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['ALL', 'COMPLETED', 'VOIDED', 'REFUNDED']).default('ALL')
});

module.exports = {
  checkoutSchema,
  customerSchema,
  saleQuerySchema
};
