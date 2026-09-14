const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Product = require('../src/models/Product');
const Supplier = require('../src/models/Supplier');
const Purchase = require('../src/models/Purchase');
const StockMovement = require('../src/models/StockMovement');
const User = require('../src/models/User');
const { generateAccessToken } = require('../src/utils/token');

require('./setup');

describe('Module: Purchases Management', () => {
  let tokenOwnerA;
  let userOwnerA;
  let orgOwnerA;

  let tokenStockManagerA;
  let userStockManagerA;

  let tokenCashierA;
  let userCashierA;

  let tokenOwnerB;
  let userOwnerB;
  let orgOwnerB;

  let productA1;
  let productA2;
  let supplierA1;

  beforeEach(async () => {
    // 1. Register Tenant A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Owner',
        email: 'alice.purchase@alpha.com',
        password: 'Password123!',
        organizationName: 'Alpha Logistics',
        currency: 'INR'
      });
    tokenOwnerA = resA.body.data.accessToken;
    userOwnerA = resA.body.data.user;
    orgOwnerA = resA.body.data.organization;

    // 2. Create Stock Manager under Tenant A
    const smDoc = await User.create({
      name: 'Sam StockManager',
      email: 'sam.purchase@alpha.com',
      password: 'HashedPassword123!',
      organizationId: orgOwnerA._id,
      role: 'STOCK_MANAGER'
    });
    userStockManagerA = smDoc;
    tokenStockManagerA = generateAccessToken({
      id: smDoc._id,
      organizationId: orgOwnerA._id,
      role: 'STOCK_MANAGER',
      email: smDoc.email
    });

    // 3. Create Cashier under Tenant A
    const cashierDoc = await User.create({
      name: 'Carl Cashier',
      email: 'carl.purchase@alpha.com',
      password: 'HashedPassword123!',
      organizationId: orgOwnerA._id,
      role: 'CASHIER'
    });
    userCashierA = cashierDoc;
    tokenCashierA = generateAccessToken({
      id: cashierDoc._id,
      organizationId: orgOwnerA._id,
      role: 'CASHIER',
      email: cashierDoc.email
    });

    // 4. Register Tenant B
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Owner',
        email: 'bob.purchase@beta.com',
        password: 'Password123!',
        organizationName: 'Beta Wholesalers',
        currency: 'USD'
      });
    tokenOwnerB = resB.body.data.accessToken;
    userOwnerB = resB.body.data.user;
    orgOwnerB = resB.body.data.organization;

    // 5. Create test products for Tenant A
    productA1 = await Product.create({
      name: 'Steel Rods 10mm',
      SKU: 'SR-10MM',
      purchasePrice: 100,
      sellingPrice: 150,
      currentStock: 10,
      organizationId: orgOwnerA._id,
      createdBy: userOwnerA.id
    });

    productA2 = await Product.create({
      name: 'Cement Bags 50kg',
      SKU: 'CB-50KG',
      purchasePrice: 300,
      sellingPrice: 400,
      currentStock: 5,
      organizationId: orgOwnerA._id,
      createdBy: userOwnerA.id
    });

    // 6. Create test supplier for Tenant A
    supplierA1 = await Supplier.create({
      name: 'Industrial Supplies Corp',
      companyName: 'IndSupply Ltd',
      phone: '9876543210',
      email: 'sales@indsupply.com',
      organizationId: orgOwnerA._id,
      createdBy: userOwnerA.id
    });
  });

  describe('POST /api/v1/purchases', () => {
    it('should allow OWNER to create a RECEIVED purchase order, auto-incrementing inventory stock', async () => {
      const payload = {
        supplierId: supplierA1._id.toString(),
        status: 'RECEIVED',
        paymentStatus: 'PAID',
        items: [
          {
            productId: productA1._id.toString(),
            quantity: 20,
            unitCost: 105,
            taxPercentage: 10
          },
          {
            productId: productA2._id.toString(),
            quantity: 10,
            unitCost: 310,
            taxPercentage: 5
          }
        ],
        notes: 'Urgent stock inward'
      };

      const res = await request(app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purchaseNumber).toMatch(/^PO-\d{8}-\d{4}$/);
      expect(res.body.data.status).toBe('RECEIVED');
      expect(res.body.data.items).toHaveLength(2);

      // Verify product stocks were incremented atomically
      const updatedProduct1 = await Product.findById(productA1._id);
      expect(updatedProduct1.currentStock).toBe(30); // 10 initial + 20
      expect(updatedProduct1.purchasePrice).toBe(105);

      const updatedProduct2 = await Product.findById(productA2._id);
      expect(updatedProduct2.currentStock).toBe(15); // 5 initial + 10

      // Verify stock movement records created
      const movements = await StockMovement.find({
        organizationId: orgOwnerA._id,
        referenceId: res.body.data.purchaseNumber
      });
      expect(movements).toHaveLength(2);
      expect(movements[0].type).toBe('PURCHASE');

      // Verify supplier totalPurchases & totalPaid updated
      const updatedSupplier = await Supplier.findById(supplierA1._id);
      expect(updatedSupplier.totalPurchases).toBe(res.body.data.grandTotal);
      expect(updatedSupplier.totalPaid).toBe(res.body.data.grandTotal);
    });

    it('should create an ORDERED purchase order without changing current stock until received', async () => {
      const payload = {
        supplierId: supplierA1._id.toString(),
        status: 'ORDERED',
        paymentStatus: 'PENDING',
        items: [
          {
            productId: productA1._id.toString(),
            quantity: 50,
            unitCost: 95
          }
        ]
      };

      const res = await request(app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenStockManagerA}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('ORDERED');

      // Stock should remain unchanged
      const product = await Product.findById(productA1._id);
      expect(product.currentStock).toBe(10);

      // Now transition to RECEIVED
      const updateRes = await request(app)
        .patch(`/api/v1/purchases/${res.body.data._id}/status`)
        .set('Authorization', `Bearer ${tokenStockManagerA}`)
        .send({ status: 'RECEIVED' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.status).toBe('RECEIVED');

      // Stock should now be incremented (10 + 50 = 60)
      const stockedProduct = await Product.findById(productA1._id);
      expect(stockedProduct.currentStock).toBe(60);
    });

    it('should reject CASHIER role with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenCashierA}`)
        .send({
          items: [{ productId: productA1._id.toString(), quantity: 5, unitCost: 100 }]
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/purchases', () => {
    beforeEach(async () => {
      // Create PO 1
      await request(app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          supplierId: supplierA1._id.toString(),
          status: 'RECEIVED',
          paymentStatus: 'PAID',
          items: [{ productId: productA1._id.toString(), quantity: 5, unitCost: 100 }]
        });

      // Create PO 2
      await request(app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          supplierId: supplierA1._id.toString(),
          status: 'ORDERED',
          paymentStatus: 'PENDING',
          items: [{ productId: productA2._id.toString(), quantity: 15, unitCost: 200 }]
        });
    });

    it('should list purchases with summary metrics for Tenant A', async () => {
      const res = await request(app)
        .get('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.purchases).toHaveLength(2);
      expect(res.body.data.summary.totalOrdersCount).toBe(2);
      expect(res.body.data.summary.receivedCount).toBe(1);
      expect(res.body.data.summary.orderedCount).toBe(1);
    });

    it('should isolate Tenant B from seeing Tenant A purchases', async () => {
      const res = await request(app)
        .get('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenOwnerB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.purchases).toHaveLength(0);
      expect(res.body.data.summary.totalOrdersCount).toBe(0);
    });
  });

  describe('GET /api/v1/purchases/:id', () => {
    it('should return populated purchase details', async () => {
      const createRes = await request(app)
        .post('/api/v1/purchases')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          supplierId: supplierA1._id.toString(),
          status: 'RECEIVED',
          items: [{ productId: productA1._id.toString(), quantity: 8, unitCost: 110 }]
        });

      const poId = createRes.body.data._id;

      const res = await request(app)
        .get(`/api/v1/purchases/${poId}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data._id).toBe(poId);
      expect(res.body.data.supplierId.name).toBe(supplierA1.name);
      expect(res.body.data.items[0].name).toBe(productA1.name);
    });
  });
});
