const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchase.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');
const { hasRole } = require('../middlewares/rbac.middleware');
const { ROLES } = require('../constants/roles');

router.use(authMiddleware);
router.use(tenantMiddleware);

// CASHIER is strictly prohibited from purchase orders
router.use(hasRole(ROLES.OWNER, ROLES.MANAGER, ROLES.STOCK_MANAGER));

router.get('/', (req, res, next) => purchaseController.getPurchases(req, res, next));
router.post('/', (req, res, next) => purchaseController.createPurchase(req, res, next));
router.get('/:id', (req, res, next) => purchaseController.getPurchaseById(req, res, next));
router.patch('/:id/status', (req, res, next) => purchaseController.updatePurchaseStatus(req, res, next));
router.delete('/:id', hasRole(ROLES.OWNER, ROLES.MANAGER), (req, res, next) =>
  purchaseController.deletePurchase(req, res, next)
);

module.exports = router;
