const AppError = require('../utils/AppError');

const hasRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return next(new AppError('User role not authenticated', 401, 'UNAUTHORIZED'));
    }

    const flatRoles = allowedRoles.flat();
    if (!flatRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Forbidden: Role '${req.user.role}' is not authorized to access this resource`,
          403,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
};

module.exports = {
  hasRole
};
