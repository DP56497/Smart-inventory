const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { tenantMiddleware } = require('../middlewares/tenant.middleware');

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/', (req, res, next) => categoryController.getCategories(req, res, next));
router.post('/', (req, res, next) => categoryController.createCategory(req, res, next));
router.delete('/:id', (req, res, next) => categoryController.deleteCategory(req, res, next));

module.exports = router;
