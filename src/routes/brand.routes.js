const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brand.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/', (req, res, next) => brandController.getBrands(req, res, next));
router.post('/', (req, res, next) => brandController.createBrand(req, res, next));
router.delete('/:id', (req, res, next) => brandController.deleteBrand(req, res, next));

module.exports = router;
