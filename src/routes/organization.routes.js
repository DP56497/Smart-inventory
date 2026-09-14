const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organization.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');
const { hasRole } = require('../middlewares/rbac.middleware');
const { ROLES } = require('../constants/roles');

// All organization routes require authenticated user and tenant context
router.use(authMiddleware);
router.use(tenantMiddleware);

// Profile routes
router.get('/profile', (req, res, next) => organizationController.getProfile(req, res, next));
router.patch(
  '/profile',
  hasRole(ROLES.OWNER),
  (req, res, next) => organizationController.updateProfile(req, res, next)
);

// Settings routes
router.get('/settings', (req, res, next) => organizationController.getSettings(req, res, next));
router.patch(
  '/settings',
  hasRole(ROLES.OWNER),
  (req, res, next) => organizationController.updateSettings(req, res, next)
);

module.exports = router;
