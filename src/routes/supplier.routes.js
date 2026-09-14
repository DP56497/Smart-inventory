const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplier.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');
const { hasRole } = require('../middlewares/rbac.middleware');
const { ROLES } = require('../constants/roles');

router.use(authMiddleware);
router.use(tenantMiddleware);

// CASHIER is strictly prohibited from supplier operations
router.use(hasRole(ROLES.OWNER, ROLES.MANAGER, ROLES.STOCK_MANAGER));

// Core CRUD
router.get('/', (req, res, next) => supplierController.getSuppliers(req, res, next));
router.post('/', (req, res, next) => supplierController.createSupplier(req, res, next));
router.get('/:id', (req, res, next) => supplierController.getSupplierById(req, res, next));
router.patch('/:id', (req, res, next) => supplierController.updateSupplier(req, res, next));
router.delete('/:id', hasRole(ROLES.OWNER, ROLES.MANAGER), (req, res, next) =>
  supplierController.deleteSupplier(req, res, next)
);

// Supplier details, ledger, purchases, and summary
router.get('/:id/summary', (req, res, next) => supplierController.getSupplierSummary(req, res, next));
router.get('/:id/purchases', (req, res, next) => supplierController.getSupplierPurchases(req, res, next));
router.get('/:id/ledger', (req, res, next) => supplierController.getSupplierLedger(req, res, next));

module.exports = router;
