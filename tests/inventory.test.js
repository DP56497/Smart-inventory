const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Product = require('../src/models/Product');
const StockMovement = require('../src/models/StockMovement');

require('./setup');

describe('Phase 4: Inventory & Stock Movement System', () => {
  let tokenA;
  let userA;
  let orgA;

  let tokenB;
  let userB;
  let orgB;

  let productA;

  beforeEach(async () => {
    // 1. Register Tenant A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Owner',
        email: 'alice.inventory@alpha.com',
        password: 'Password123!',
        organizationName: 'Alpha Warehouse',
        currency: 'USD'
      });
    tokenA = resA.body.data.accessToken;
    userA = resA.body.data.user;
    orgA = resA.body.data.organization;

    // 2. Register Tenant B
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Owner',
        email: 'bob.inventory@beta.com',
        password: 'Password123!',
        organizationName: 'Beta Warehouse',
        currency: 'EUR'
      });
    tokenB = resB.body.data.accessToken;
    userB = resB.body.data.user;
    orgB = resB.body.data.organization;

    // 3. Create initial product for Tenant A with initial stock
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Industrial Barcode Scanner',
        SKU: 'SCN-100',
        barcode: '890112233445',
        purchasePrice: 120,
        sellingPrice: 199.99,
        currentStock: 50,
        minimumStock: 10,
        reorderLevel: 15,
        maximumStock: 100
      });
    productA = prodRes.body.data.product;
  });

  describe('1. Initial Stock & Audit Logging', () => {
    it('should automatically record an initial StockMovement when product is created with stock', async () => {
      const movements = await StockMovement.find({
        organizationId: orgA._id,
        productId: productA._id
      });

      expect(movements.length).toBe(1);
      expect(movements[0].type).toBe('ADJUSTMENT_IN');
      expect(movements[0].quantity).toBe(50);
      expect(movements[0].previousStock).toBe(0);
      expect(movements[0].newStock).toBe(50);
      expect(movements[0].referenceType).toBe('INITIAL_STOCK');
      expect(movements[0].createdBy.toString()).toBe(userA.id.toString());
    });

    it('should NOT allow arbitrary direct stock modification via PATCH /api/products/:id', async () => {
      const res = await request(app)
        .patch(`/api/products/${productA._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Industrial Barcode Scanner v2',
          currentStock: 9999 // Attempting direct modification
        });

      expect(res.status).toBe(200);
      expect(res.body.data.product.name).toBe('Industrial Barcode Scanner v2');
      // Stock must remain unchanged at 50
      expect(res.body.data.product.currentStock).toBe(50);

      // Verify no fraudulent movement was logged
      const count = await StockMovement.countDocuments({
        productId: productA._id,
        referenceType: { $ne: 'INITIAL_STOCK' }
      });
      expect(count).toBe(0);
    });
  });

  describe('2. Stock Adjustment Endpoint (POST /api/inventory/adjustment)', () => {
    it('should perform ADJUSTMENT_IN and calculate newStock accurately', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustment')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          productId: productA._id,
          type: 'ADJUSTMENT_IN',
          quantity: 20,
          reason: 'Physical inventory audit count surplus',
          referenceId: 'AUDIT-2026-01'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.currentStock).toBe(70);
      expect(res.body.data.movement.previousStock).toBe(50);
      expect(res.body.data.movement.newStock).toBe(70);
      expect(res.body.data.movement.quantity).toBe(20);
      expect(res.body.data.movement.type).toBe('ADJUSTMENT_IN');
      expect(res.body.data.movement.reason).toBe('Physical inventory audit count surplus');
      expect(res.body.data.movement.referenceId).toBe('AUDIT-2026-01');

      // Verify in database
      const dbProduct = await Product.findById(productA._id);
      expect(dbProduct.currentStock).toBe(70);
    });

    it('should perform ADJUSTMENT_OUT and calculate newStock accurately', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustment')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          productId: productA._id,
          type: 'ADJUSTMENT_OUT',
          quantity: 15,
          reason: 'Damaged in warehouse during transit',
          referenceId: 'DMG-001'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.product.currentStock).toBe(35);
      expect(res.body.data.movement.previousStock).toBe(50);
      expect(res.body.data.movement.newStock).toBe(35);
      expect(res.body.data.movement.quantity).toBe(15);
      expect(res.body.data.movement.type).toBe('ADJUSTMENT_OUT');
    });

    it('should reject ADJUSTMENT_OUT if quantity exceeds current stock (prevent negative stock)', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustment')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          productId: productA._id,
          type: 'ADJUSTMENT_OUT',
          quantity: 100, // Available: 50
          reason: 'Attempting overdraft'
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INSUFFICIENT_STOCK');

      // Verify stock untouched
      const dbProduct = await Product.findById(productA._id);
      expect(dbProduct.currentStock).toBe(50);
    });

    it('should reject invalid or non-positive quantities', async () => {
      const resZero = await request(app)
        .post('/api/inventory/adjustment')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          productId: productA._id,
          type: 'ADJUSTMENT_IN',
          quantity: 0,
          reason: 'Zero test'
        });
      expect(resZero.status).toBe(400);

      const resNegative = await request(app)
        .post('/api/inventory/adjustment')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          productId: productA._id,
          type: 'ADJUSTMENT_IN',
          quantity: -10,
          reason: 'Negative test'
        });
      expect(resNegative.status).toBe(400);
    });

    it('should reject adjustment without reason', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustment')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          productId: productA._id,
          type: 'ADJUSTMENT_IN',
          quantity: 10
        });

      expect(res.status).toBe(400);
    });
  });

  describe('3. Multi-Tenant Scoping & Security', () => {
    it('should prevent Tenant B from adjusting stock of Tenant A product', async () => {
      const res = await request(app)
        .post('/api/inventory/adjustment')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          productId: productA._id,
          type: 'ADJUSTMENT_IN',
          quantity: 50,
          reason: 'Hacking Tenant A stock'
        });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PRODUCT_NOT_FOUND');

      // Verify stock untouched
      const dbProduct = await Product.findById(productA._id);
      expect(dbProduct.currentStock).toBe(50);
    });

    it('should prevent Tenant B from viewing Tenant A inventory or single product inventory', async () => {
      const resSingle = await request(app)
        .get(`/api/inventory/${productA._id}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resSingle.status).toBe(404);

      const resList = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resList.status).toBe(200);
      expect(resList.body.data.products.length).toBe(0);
    });

    it('should isolate stock movements between tenants', async () => {
      // Create movement for Tenant A
      await request(app)
        .post('/api/inventory/adjustment')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          productId: productA._id,
          type: 'ADJUSTMENT_IN',
          quantity: 10,
          reason: 'Tenant A Restock'
        });

      // Tenant B queries movements
      const resB = await request(app)
        .get('/api/inventory/movements')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.movements.length).toBe(0);
    });
  });

  describe('4. Inventory Query Endpoints & Financial Valuations', () => {
    beforeEach(async () => {
      // Create Low-stock item
      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Thermal Receipt Paper',
          SKU: 'PAP-001',
          purchasePrice: 2,
          sellingPrice: 5,
          currentStock: 4,
          minimumStock: 5,
          reorderLevel: 10
        });

      // Create Out-of-stock item
      await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Spare Printhead',
          SKU: 'PRN-001',
          purchasePrice: 45,
          sellingPrice: 85,
          currentStock: 0,
          minimumStock: 2,
          reorderLevel: 5
        });
    });

    it('should retrieve inventory with calculated valuations and overall summary metrics', async () => {
      const res = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(3);

      const scanner = res.body.data.products.find((p) => p.SKU === 'SCN-100');
      expect(scanner.stockValuePurchase).toBe(6000); // 50 * 120
      expect(scanner.stockValueSelling).toBe(9999.5); // 50 * 199.99
      expect(scanner.stockStatus).toBe('IN_STOCK');

      const paper = res.body.data.products.find((p) => p.SKU === 'PAP-001');
      expect(paper.stockStatus).toBe('LOW_STOCK');

      const printhead = res.body.data.products.find((p) => p.SKU === 'PRN-001');
      expect(printhead.stockStatus).toBe('OUT_OF_STOCK');

      // Summary metrics check
      const summary = res.body.data.summary;
      expect(summary.totalItems).toBe(3);
      expect(summary.totalQuantity).toBe(54); // 50 + 4 + 0
      expect(summary.lowStockCount).toBe(1);
      expect(summary.outOfStockCount).toBe(1);
    });

    it('should retrieve low-stock items via GET /api/inventory/low-stock', async () => {
      const res = await request(app)
        .get('/api/inventory/low-stock')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(1);
      expect(res.body.data.products[0].SKU).toBe('PAP-001');
    });

    it('should retrieve out-of-stock items via GET /api/inventory/out-of-stock', async () => {
      const res = await request(app)
        .get('/api/inventory/out-of-stock')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(1);
      expect(res.body.data.products[0].SKU).toBe('PRN-001');
    });

    it('should retrieve single product inventory and movement history via GET /api/inventory/:productId', async () => {
      // Add an adjustment first
      await request(app)
        .post('/api/inventory/adjustment')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          productId: productA._id,
          type: 'ADJUSTMENT_IN',
          quantity: 5,
          reason: 'Test adjustment history'
        });

      const res = await request(app)
        .get(`/api/inventory/${productA._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.product.name).toBe('Industrial Barcode Scanner');
      expect(res.body.data.product.currentStock).toBe(55);
      expect(res.body.data.product.stockValuePurchase).toBe(6600); // 55 * 120
      expect(res.body.data.product.recentMovements.length).toBe(2); // Initial stock + adjustment
      expect(res.body.data.product.recentMovements[0].type).toBe('ADJUSTMENT_IN');
    });

    it('should retrieve paginated stock movements via GET /api/inventory/movements with filter', async () => {
      const res = await request(app)
        .get(`/api/inventory/movements?productId=${productA._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.movements.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.movements[0].productId.name).toBe('Industrial Barcode Scanner');
    });
  });

  describe('5. Concurrency Handling', () => {
    it('should handle parallel stock adjustments reliably without data loss', async () => {
      // Run 4 concurrent stock adjustments of 5 units each
      const adjustmentPromises = [1, 2, 3, 4].map((idx) =>
        request(app)
          .post('/api/inventory/adjustment')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({
            productId: productA._id,
            type: 'ADJUSTMENT_IN',
            quantity: 5,
            reason: `Parallel restock thread ${idx}`
          })
      );

      const results = await Promise.all(adjustmentPromises);
      const successfulCount = results.filter((r) => r.status === 201).length;
      expect(successfulCount).toBe(4);

      // Verify product stock increased by exactly 4 * 5 = 20 (50 -> 70)
      const updatedProduct = await Product.findById(productA._id);
      expect(updatedProduct.currentStock).toBe(70);

      // Verify total movements for this product: 1 initial + 4 adjustments = 5
      const totalMovements = await StockMovement.countDocuments({
        productId: productA._id
      });
      expect(totalMovements).toBe(5);
    });
  });
});
