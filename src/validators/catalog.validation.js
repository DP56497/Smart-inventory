const { z } = require('zod');

const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100),
  description: z.string().trim().max(500).optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE')
});

const createBrandSchema = z.object({
  name: z.string().trim().min(1, 'Brand name is required').max(100),
  description: z.string().trim().max(500).optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE')
});

const createUnitSchema = z.object({
  name: z.string().trim().min(1, 'Unit name is required').max(50),
  code: z.string().trim().min(1, 'Unit code is required').max(20).transform((v) => v.toUpperCase()),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE')
});

module.exports = {
  createCategorySchema,
  createBrandSchema,
  createUnitSchema
};
