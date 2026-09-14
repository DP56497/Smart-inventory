const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');

// All product routes require authenticated user and tenant context
router.use(authMiddleware);
router.use(tenantMiddleware);

// GET /api/products
router.get('/', (req, res, next) => productController.getProducts(req, res, next));

// POST /api/products
router.post('/', (req, res, next) => productController.createProduct(req, res, next));

// GET /api/products/:id
router.get('/:id', (req, res, next) => productController.getProductById(req, res, next));

// PATCH /api/products/:id
router.patch('/:id', (req, res, next) => productController.updateProduct(req, res, next));

// DELETE /api/products/:id
router.delete('/:id', (req, res, next) => productController.deleteProduct(req, res, next));

module.exports = router;
