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

const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(200, 'Product name cannot exceed 200 characters'),
  SKU: z.string().trim().min(1, 'SKU is required').max(100, 'SKU cannot exceed 100 characters').transform((v) => v.toUpperCase()),
  barcode: z.string().trim().max(100).optional().default(''),
  categoryId: optionalObjectId.optional(),
  brandId: optionalObjectId.optional(),
  unitId: optionalObjectId.optional(),
  purchasePrice: z.coerce.number().min(0, 'Purchase price cannot be negative').default(0),
  sellingPrice: z.coerce.number().min(0, 'Selling price cannot be negative').default(0),
  taxPercentage: z.coerce.number().min(0, 'Tax percentage cannot be negative').max(100, 'Tax percentage cannot exceed 100').default(0),
  currentStock: z.coerce.number().min(0, 'Current stock cannot be negative').default(0),
  minimumStock: z.coerce.number().min(0, 'Minimum stock cannot be negative').default(0),
  maximumStock: z.coerce.number().min(0, 'Maximum stock cannot be negative').default(0),
  reorderLevel: z.coerce.number().min(0, 'Reorder level cannot be negative').default(0),
  supplierId: optionalObjectId.optional(),
  branchId: optionalObjectId.optional(),
  description: z.string().trim().optional().default(''),
  images: z.array(z.string().url('Invalid image URL')).or(z.array(z.string())).optional().default([]),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional().default('ACTIVE')
});

const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  SKU: z.string().trim().min(1).max(100).transform((v) => v.toUpperCase()).optional(),
  barcode: z.string().trim().max(100).optional(),
  categoryId: optionalObjectId.optional(),
  brandId: optionalObjectId.optional(),
  unitId: optionalObjectId.optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  taxPercentage: z.coerce.number().min(0).max(100).optional(),
  minimumStock: z.coerce.number().min(0).optional(),
  maximumStock: z.coerce.number().min(0).optional(),
  reorderLevel: z.coerce.number().min(0).optional(),
  supplierId: optionalObjectId.optional(),
  branchId: optionalObjectId.optional(),
  description: z.string().trim().optional(),
  images: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional()
});

const productQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  categoryId: optionalObjectId.optional(),
  brandId: optionalObjectId.optional(),
  unitId: optionalObjectId.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'ALL']).optional(),
  lowStock: z.union([z.boolean(), z.string().transform((v) => v === 'true')]).optional(),
  outOfStock: z.union([z.boolean(), z.string().transform((v) => v === 'true')]).optional(),
  sortBy: z.enum(['name', 'SKU', 'sellingPrice', 'purchasePrice', 'currentStock', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  productQuerySchema
};
