const { z } = require('zod');

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional()
    })
    .optional(),
  gstin: z.string().optional(),
  logo: z.string().optional(),
  currency: z.string().min(2).max(5).optional(),
  timezone: z.string().optional()
});

const updateSettingsSchema = z.object({
  taxSettings: z
    .object({
      enableGst: z.boolean().optional(),
      defaultTaxRate: z.number().min(0).max(100).optional(),
      cgstRate: z.number().min(0).max(100).optional(),
      sgstRate: z.number().min(0).max(100).optional(),
      igstRate: z.number().min(0).max(100).optional()
    })
    .optional(),
  inventorySettings: z
    .object({
      enableNegativeInventory: z.boolean().optional(),
      lowStockAlertThreshold: z.number().min(0).optional(),
      allowBackorders: z.boolean().optional(),
      defaultUnit: z.string().optional()
    })
    .optional()
});

module.exports = {
  updateProfileSchema,
  updateSettingsSchema
};
