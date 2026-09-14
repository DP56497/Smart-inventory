const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const organizationRoutes = require('./organization.routes');
const productRoutes = require('./product.routes');
const categoryRoutes = require('./category.routes');
const brandRoutes = require('./brand.routes');
const unitRoutes = require('./unit.routes');
const inventoryRoutes = require('./inventory.routes');
const posRoutes = require('./pos.routes');
const customerRoutes = require('./customer.routes');
const dashboardRoutes = require('./dashboard.routes');
const supplierRoutes = require('./supplier.routes');
const purchaseRoutes = require('./purchase.routes');
const reportRoutes = require('./report.routes');

router.use('/auth', authRoutes);
router.use('/organization', organizationRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/brands', brandRoutes);
router.use('/units', unitRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/pos', posRoutes);
router.use('/customers', customerRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/reports', reportRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Smart-Inventory API'
  });
});

module.exports = router;
