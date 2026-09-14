const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventory.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');

// All inventory routes require authenticated user and organization tenant context
router.use(authMiddleware);
router.use(tenantMiddleware);

// GET /api/inventory - Paginated inventory with valuations, status, metrics
router.get('/', (req, res, next) => inventoryController.getInventory(req, res, next));

// GET /api/inventory/movements - Stock movement audit ledger
router.get('/movements', (req, res, next) => inventoryController.getMovements(req, res, next));

// POST /api/inventory/adjustment - Manual stock adjustment
router.post('/adjustment', (req, res, next) => inventoryController.createAdjustment(req, res, next));

// GET /api/inventory/low-stock - Products at or below reorder level
router.get('/low-stock', (req, res, next) => inventoryController.getLowStock(req, res, next));

// GET /api/inventory/out-of-stock - Depleted products
router.get('/out-of-stock', (req, res, next) => inventoryController.getOutOfStock(req, res, next));

// GET /api/inventory/:productId - Single product stock overview and recent movement history
router.get('/:productId', (req, res, next) => inventoryController.getProductInventory(req, res, next));

module.exports = router;
