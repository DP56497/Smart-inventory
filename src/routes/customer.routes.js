const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');
const { hasRole } = require('../middlewares/rbac.middleware');
const { ROLES } = require('../constants/roles');

router.use(authMiddleware);
router.use(tenantMiddleware);

// Cashiers, Managers, and Owners can access customer directory & operations
router.use(hasRole(ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER));

router.get('/', (req, res, next) => customerController.getCustomers(req, res, next));
router.post('/', (req, res, next) => customerController.createCustomer(req, res, next));
router.get('/:id', (req, res, next) => customerController.getCustomerById(req, res, next));
router.patch('/:id', (req, res, next) => customerController.updateCustomer(req, res, next));

// Only Owner & Manager can delete/deactivate customers
router.delete('/:id', hasRole(ROLES.OWNER, ROLES.MANAGER), (req, res, next) =>
  customerController.deleteCustomer(req, res, next)
);

// Customer Financial & History Extensions
router.get('/:id/summary', (req, res, next) => customerController.getCustomerSummary(req, res, next));
router.get('/:id/sales', (req, res, next) => customerController.getCustomerSales(req, res, next));
router.get('/:id/payments', (req, res, next) => customerController.getCustomerPayments(req, res, next));
router.post('/:id/payments', (req, res, next) => customerController.recordCustomerPayment(req, res, next));
router.get('/:id/ledger', (req, res, next) => customerController.getCustomerLedger(req, res, next));

module.exports = router;
