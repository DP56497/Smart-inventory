const { z } = require('zod');

const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier contact name is required').max(150),
  companyName: z.string().trim().max(150).optional().default(''),
  email: z.string().trim().email('Invalid email address').or(z.literal('')).optional().default(''),
  phone: z.string().trim().max(30).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
  city: z.string().trim().max(100).optional().default(''),
  state: z.string().trim().max(100).optional().default(''),
  pincode: z.string().trim().max(20).optional().default(''),
  gstin: z.string().trim().max(20).optional().default(''),
  openingBalance: z.coerce.number().optional().default(0),
  creditLimit: z.coerce.number().min(0, 'Credit limit cannot be negative').optional().default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
});

const updateSupplierSchema = createSupplierSchema.partial();

const supplierQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']).default('ALL'),
  hasBalance: z.enum(['ALL', 'YES', 'NO']).default('ALL'),
  sortBy: z.enum(['name', 'companyName', 'createdAt', 'outstandingPayable']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

module.exports = {
  createSupplierSchema,
  updateSupplierSchema,
  supplierQuerySchema
};
