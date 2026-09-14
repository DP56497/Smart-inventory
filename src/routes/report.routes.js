const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');
const { hasRole } = require('../middlewares/rbac.middleware');
const { ROLES } = require('../constants/roles');

router.use(authMiddleware);
router.use(tenantMiddleware);

// Only OWNER and MANAGER are authorized to access financial reports and profit calculations
router.use(hasRole(ROLES.OWNER, ROLES.MANAGER));

router.get('/financial', (req, res, next) => reportController.getFinancialSummary(req, res, next));
router.get('/sales', (req, res, next) => reportController.getSalesReport(req, res, next));
router.get('/inventory', (req, res, next) => reportController.getInventoryReport(req, res, next));
router.get('/purchases', (req, res, next) => reportController.getPurchasesReport(req, res, next));
router.get('/customers', (req, res, next) => reportController.getCustomerReport(req, res, next));

module.exports = router;
