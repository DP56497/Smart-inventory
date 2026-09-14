const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unit.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/', (req, res, next) => unitController.getUnits(req, res, next));
router.post('/', (req, res, next) => unitController.createUnit(req, res, next));
router.delete('/:id', (req, res, next) => unitController.deleteUnit(req, res, next));

module.exports = router;
