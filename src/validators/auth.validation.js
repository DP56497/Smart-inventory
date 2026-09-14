const { z } = require('zod');

const registerOwnerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
  phone: z.string().optional(),
  gstin: z.string().optional(),
  currency: z.string().default('INR'),
  timezone: z.string().default('Asia/Kolkata')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Password reset token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100)
});

module.exports = {
  registerOwnerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema
};

