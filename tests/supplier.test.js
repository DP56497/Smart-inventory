const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Supplier = require('../src/models/Supplier');
const Purchase = require('../src/models/Purchase');
const User = require('../src/models/User');
const { generateAccessToken } = require('../src/utils/token');

require('./setup');

describe('Module: Supplier Management (Step 1)', () => {
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

  let supplierA1;

  beforeEach(async () => {
    // 1. Register Tenant A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Owner',
        email: 'alice.supplier@alpha.com',
        password: 'Password123!',
        organizationName: 'Alpha Warehouse',
        currency: 'INR'
      });
    tokenOwnerA = resA.body.data.accessToken;
    userOwnerA = resA.body.data.user;
    orgOwnerA = resA.body.data.organization;

    // 2. Create Stock Manager under Tenant A
    const smDoc = await User.create({
      name: 'Sam StockManager',
      email: 'sam.sm@alpha.com',
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
      email: 'carl.cashier@alpha.com',
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

    // 4. Register Tenant B (Isolation)
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Owner',
        email: 'bob.supplier@beta.com',
        password: 'Password123!',
        organizationName: 'Beta Warehouse',
        currency: 'USD'
      });
    tokenOwnerB = resB.body.data.accessToken;
    userOwnerB = resB.body.data.user;
    orgOwnerB = resB.body.data.organization;

    // 5. Create initial Supplier for Tenant A
    const supRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${tokenOwnerA}`)
      .send({
        name: 'John Doe',
        companyName: 'Apex Tech Hardware',
        email: 'john@apexhardware.com',
        phone: '9876543210',
        address: '12 Industrial Area',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
        gstin: '29ABCDE1234F1Z5',
        openingBalance: 5000,
        creditLimit: 50000
      });
    supplierA1 = supRes.body.data;
  });

  describe('CRUD & Multi-Tenant Isolation', () => {
    it('should create supplier with correct organizationId and balance', async () => {
      expect(supplierA1._id).toBeDefined();
      expect(supplierA1.companyName).toBe('Apex Tech Hardware');
      expect(supplierA1.outstandingPayable).toBe(5000);
      expect(supplierA1.status).toBe('ACTIVE');

      const dbRecord = await Supplier.findById(supplierA1._id);
      expect(dbRecord.organizationId.toString()).toBe(orgOwnerA._id.toString());
    });

    it('should list and search suppliers scoped to organization', async () => {
      // Create second supplier for Tenant A
      await request(app)
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          name: 'Priya Sharma',
          companyName: 'Silicon Logistics',
          email: 'priya@silicon.com',
          phone: '9123456789'
        });

      // Tenant A search
      const res = await request(app)
        .get('/api/v1/suppliers?search=Silicon')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].companyName).toBe('Silicon Logistics');
      expect(res.body.meta.total).toBe(1);
    });

    it('should prevent Tenant B from accessing or seeing Tenant A suppliers', async () => {
      // Tenant B lists suppliers -> should be empty
      const listResB = await request(app)
        .get('/api/v1/suppliers')
        .set('Authorization', `Bearer ${tokenOwnerB}`);

      expect(listResB.status).toBe(200);
      expect(listResB.body.data.length).toBe(0);

      // Tenant B tries to get Tenant A's supplier by ID -> 404
      const singleResB = await request(app)
        .get(`/api/v1/suppliers/${supplierA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerB}`);

      expect(singleResB.status).toBe(404);
      expect(singleResB.body.code).toBe('SUPPLIER_NOT_FOUND');
    });

    it('should update supplier fields safely', async () => {
      const updateRes = await request(app)
        .patch(`/api/v1/suppliers/${supplierA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          companyName: 'Apex Global Tech Ltd',
          phone: '9998887776'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.companyName).toBe('Apex Global Tech Ltd');
      expect(updateRes.body.data.phone).toBe('9998887776');
    });
  });

  describe('RBAC Role Permissions', () => {
    it('should reject CASHIER from managing or accessing suppliers (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/suppliers')
        .set('Authorization', `Bearer ${tokenCashierA}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');

      const createRes = await request(app)
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${tokenCashierA}`)
        .send({
          name: 'Forbidden Vendor'
        });

      expect(createRes.status).toBe(403);
    });

    it('should allow STOCK_MANAGER to view and create suppliers', async () => {
      const res = await request(app)
        .get('/api/v1/suppliers')
        .set('Authorization', `Bearer ${tokenStockManagerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);

      const createRes = await request(app)
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${tokenStockManagerA}`)
        .send({
          name: 'Vendor Created By StockManager',
          companyName: 'Warehouse Parts Inc',
          phone: '9888777666'
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.name).toBe('Vendor Created By StockManager');
    });
  });

  describe('Safe Deletion & Purchase Integrity Guard', () => {
    it('should delete supplier when no purchases exist', async () => {
      const delRes = await request(app)
        .delete(`/api/v1/suppliers/${supplierA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.deactivated).toBe(false);

      const check = await Supplier.findById(supplierA1._id);
      expect(check).toBeNull();
    });

    it('should deactivate supplier instead of hard deleting when purchase records exist', async () => {
      // Create a mock purchase attached to this supplier
      await Purchase.create({
        organizationId: orgOwnerA._id,
        purchaseNumber: 'PO-TEST-001',
        supplierId: supplierA1._id,
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            name: 'Test Part',
            SKU: 'PART-01',
            quantity: 5,
            unitCost: 100,
            subtotal: 500,
            total: 500
          }
        ],
        subtotal: 500,
        grandTotal: 500,
        status: 'RECEIVED',
        createdBy: userOwnerA.id || userOwnerA._id
      });

      const delRes = await request(app)
        .delete(`/api/v1/suppliers/${supplierA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.deactivated).toBe(true);

      const check = await Supplier.findById(supplierA1._id);
      expect(check).not.toBeNull();
      expect(check.status).toBe('INACTIVE');
    });
  });

  describe('Supplier Ledger & Summary', () => {
    it('should retrieve supplier summary and purchase ledger', async () => {
      const summaryRes = await request(app)
        .get(`/api/v1/suppliers/${supplierA1._id}/summary`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.data.name).toBe('John Doe');
      expect(summaryRes.body.data.outstandingPayable).toBe(5000);

      const ledgerRes = await request(app)
        .get(`/api/v1/suppliers/${supplierA1._id}/ledger`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(ledgerRes.status).toBe(200);
      expect(ledgerRes.body.data.supplier.name).toBe('John Doe');
      expect(Array.isArray(ledgerRes.body.data.ledger)).toBe(true);
    });
  });
});
