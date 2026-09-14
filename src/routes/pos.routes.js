const express = require('express');
const router = express.Router();
const posController = require('../controllers/pos.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');

// Protect all POS routes with authentication and tenant context
router.use(authMiddleware);
router.use(tenantMiddleware);

// POS Checkout & Sales Operations
router.post('/checkout', (req, res, next) => posController.checkout(req, res, next));
router.get('/sales', (req, res, next) => posController.getSales(req, res, next));
router.get('/sales/:id', (req, res, next) => posController.getSaleById(req, res, next));

// POS Product Search (optimized for scanning & fast display)
router.get('/products', (req, res, next) => posController.searchProducts(req, res, next));

// POS Customer Autocomplete & Quick Add
router.get('/customers', (req, res, next) => posController.getCustomers(req, res, next));
router.post('/customers', (req, res, next) => posController.createCustomer(req, res, next));

module.exports = router;
