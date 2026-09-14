const mongoose = require('mongoose');
const AppError = require('../utils/AppError');

/**
 * Enforces multi-tenant isolation.
 * Guarantees that req.organizationId is strictly derived from the authenticated session,
 * never from the incoming request body, query parameters, or client headers.
 */
const tenantMiddleware = (req, res, next) => {
  try {
    if (!req.user || !req.user.organizationId) {
      throw new AppError('Tenant context missing. Authenticated organization required.', 403, 'TENANT_REQUIRED');
    }

    const orgIdStr = req.user.organizationId.toString();

    if (!mongoose.Types.ObjectId.isValid(orgIdStr)) {
      throw new AppError('Invalid tenant identifier format', 400, 'INVALID_TENANT_ID');
    }

    // Set server-verified organizationId on the request
    req.organizationId = new mongoose.Types.ObjectId(orgIdStr);

    // SECURITY: Sanitize body and query to strictly prevent client-side tenant spoofing
    if (req.body && typeof req.body === 'object') {
      delete req.body.organizationId;
    }
    if (req.query && typeof req.query === 'object') {
      delete req.query.organizationId;
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Scopes any Mongoose query filter to the authenticated tenant.
 * @param {import('express').Request} req
 * @param {Object} baseQuery
 * @returns {Object} baseQuery with organizationId enforced
 */
const tenantFilter = (req, baseQuery = {}) => {
  if (!req.organizationId) {
    throw new AppError('Cannot scope query: organization context not resolved.', 500, 'TENANT_SCOPE_ERROR');
  }

  return {
    ...baseQuery,
    organizationId: req.organizationId
  };
};

module.exports = {
  tenantMiddleware,
  tenantFilter
};
