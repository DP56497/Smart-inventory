const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');

router.use(authMiddleware);
router.use(tenantMiddleware);

// GET /api/v1/dashboard/stats - KPI summary and charts aggregation
router.get('/stats', (req, res, next) => dashboardController.getDashboardStats(req, res, next));

module.exports = router;
