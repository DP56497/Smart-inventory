const authService = require('../services/auth.service');
const {
  registerOwnerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} = require('../validators/auth.validation');
const { sendSuccess } = require('../utils/response');

class AuthController {
  async register(req, res, next) {
    try {
      const validatedData = registerOwnerSchema.parse(req.body);
      const result = await authService.registerOwner(validatedData);

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Organization and Owner account registered successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const result = await authService.login(email, password);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Logged in successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = refreshTokenSchema.parse(req.body);
      const tokens = await authService.refreshAccessToken(refreshToken);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Token refreshed successfully',
        data: tokens
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      await authService.logout(req.user?.id);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res, next) {
    try {
      const profile = await authService.getCurrentUser(req.user.id);

      return sendSuccess(res, {
        statusCode: 200,
        message: 'Current profile retrieved',
        data: profile
      });
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      const result = await authService.forgotPassword(email);

      return sendSuccess(res, {
        statusCode: 200,
        message: result.message,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { token, password } = resetPasswordSchema.parse(req.body);
      const result = await authService.resetPassword(token, password);

      return sendSuccess(res, {
        statusCode: 200,
        message: result.message,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
