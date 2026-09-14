const { verifyAccessToken } = require('../utils/token');
const AppError = require('../utils/AppError');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication required. No token provided.', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AppError('Authentication required. Invalid token format.', 401, 'UNAUTHORIZED');
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        throw new AppError('Access token has expired', 401, 'TOKEN_EXPIRED');
      }
      throw new AppError('Invalid access token', 401, 'INVALID_TOKEN');
    }

    // Attach verified user context from token
    req.user = {
      id: decoded.id,
      organizationId: decoded.organizationId,
      role: decoded.role,
      email: decoded.email
    };

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = authMiddleware;
