const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Customer = require('../src/models/Customer');
const CustomerPayment = require('../src/models/CustomerPayment');
const Sale = require('../src/models/Sale');
const User = require('../src/models/User');
const { generateAccessToken } = require('../src/utils/token');

require('./setup');

describe('Module: Customer Management (Step 2)', () => {
  let tokenOwnerA;
  let userOwnerA;
  let orgOwnerA;

  let tokenCashierA;
  let userCashierA;

  let tokenStockManagerA;
  let userStockManagerA;

  let tokenOwnerB;
  let userOwnerB;
  let orgOwnerB;

  let customerA1;

  beforeEach(async () => {
    // 1. Register Tenant A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Owner',
        email: 'alice.cust@alpha.com',
        password: 'Password123!',
        organizationName: 'Alpha Retailers',
        currency: 'INR'
      });
    tokenOwnerA = resA.body.data.accessToken;
    userOwnerA = resA.body.data.user;
    orgOwnerA = resA.body.data.organization;

    // 2. Create Cashier under Tenant A (Allowed in Customer Management)
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

    // 3. Create Stock Manager under Tenant A (Restricted from Customer Financials)
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

    // 4. Register Tenant B (For Cross-Tenant Isolation Tests)
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Owner',
        email: 'bob.cust@beta.com',
        password: 'Password123!',
        organizationName: 'Beta Retailers',
        currency: 'USD'
      });
    tokenOwnerB = resB.body.data.accessToken;
    userOwnerB = resB.body.data.user;
    orgOwnerB = resB.body.data.organization;

    // 5. Create initial customer under Tenant A
    const custRes = await request(app)
      .post('/api/v1/customers')
      .set('Authorization', `Bearer ${tokenOwnerA}`)
      .send({
        name: 'Rajesh Sharma',
        phone: '9876500001',
        email: 'rajesh@example.com',
        address: '45 MG Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        gstin: '27AAAAA0000A1Z5',
        openingBalance: 1500,
        creditLimit: 10000
      });

    customerA1 = custRes.body.data;
  });

  describe('CRUD and Field Validation', () => {
    it('should create customer with opening balance and auto-calculate outstanding balance', async () => {
      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          name: 'Priya Patel',
          phone: '9876500002',
          email: 'priya@example.com',
          openingBalance: 2000,
          creditLimit: 5000
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Priya Patel');
      expect(res.body.data.openingBalance).toBe(2000);
      expect(res.body.data.outstandingBalance).toBe(2000);
      expect(res.body.data.creditBalance).toBe(2000);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('should prevent creating customer with duplicate phone number in same organization', async () => {
      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          name: 'Duplicate Phone Guy',
          phone: '9876500001' // Same as customerA1
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CUSTOMER_PHONE_EXISTS');
    });

    it('should retrieve customer by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/customers/${customerA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Rajesh Sharma');
      expect(res.body.data.outstandingBalance).toBe(1500);
    });

    it('should update customer fields successfully', async () => {
      const res = await request(app)
        .patch(`/api/v1/customers/${customerA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          name: 'Rajesh Sharma Jr.',
          creditLimit: 15000
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Rajesh Sharma Jr.');
      expect(res.body.data.creditLimit).toBe(15000);
    });
  });

  describe('Pagination, Search, and Filtering', () => {
    beforeEach(async () => {
      // Create additional customers
      await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({ name: 'Amit Verma', phone: '9876500003', openingBalance: 0 });

      await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({ name: 'Sunita Rao', phone: '9876500004', openingBalance: 3000, status: 'INACTIVE' });
    });

    it('should return paginated customer list with metadata', async () => {
      const res = await request(app)
        .get('/api/v1/customers?page=1&limit=2')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.page).toBe(1);
    });

    it('should filter customers by search query (name/phone)', async () => {
      const res = await request(app)
        .get('/api/v1/customers?page=1&search=Verma')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Amit Verma');
    });

    it('should filter customers by status', async () => {
      const res = await request(app)
        .get('/api/v1/customers?page=1&status=INACTIVE')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Sunita Rao');
    });

    it('should filter customers with outstanding balance', async () => {
      const res = await request(app)
        .get('/api/v1/customers?page=1&hasBalance=YES')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((c) => c.outstandingBalance > 0)).toBe(true);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('Tenant B should NOT be able to view Tenant A customers', async () => {
      const res = await request(app)
        .get(`/api/v1/customers/${customerA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerB}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('Tenant B customer list should only return Tenant B records', async () => {
      const res = await request(app)
        .get('/api/v1/customers?page=1')
        .set('Authorization', `Bearer ${tokenOwnerB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it('Tenant B cannot update or delete Tenant A customer', async () => {
      const updateRes = await request(app)
        .patch(`/api/v1/customers/${customerA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerB}`)
        .send({ name: 'Hacked Name' });

      expect(updateRes.status).toBe(404);

      const deleteRes = await request(app)
        .delete(`/api/v1/customers/${customerA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerB}`);

      expect(deleteRes.status).toBe(404);
    });
  });

  describe('RBAC Authorization', () => {
    it('Cashier should be allowed to view customers and create customer', async () => {
      const listRes = await request(app)
        .get('/api/v1/customers?page=1')
        .set('Authorization', `Bearer ${tokenCashierA}`);

      expect(listRes.status).toBe(200);

      const createRes = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${tokenCashierA}`)
        .send({
          name: 'Walk-in Cashier Added',
          phone: '9876500099'
        });

      expect(createRes.status).toBe(201);
    });

    it('Stock Manager should be forbidden from Customer module', async () => {
      const res = await request(app)
        .get('/api/v1/customers?page=1')
        .set('Authorization', `Bearer ${tokenStockManagerA}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('Cashier should be forbidden from deleting customer', async () => {
      const res = await request(app)
        .delete(`/api/v1/customers/${customerA1._id}`)
        .set('Authorization', `Bearer ${tokenCashierA}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('Safe Deletion and Deactivation', () => {
    it('should physically delete customer if no sales records exist', async () => {
      const res = await request(app)
        .delete(`/api/v1/customers/${customerA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deactivated).toBe(false);

      const check = await Customer.findById(customerA1._id);
      expect(check).toBeNull();
    });

    it('should soft-deactivate customer if sales records exist', async () => {
      // Mock an existing sale for customerA1
      await Sale.create({
        organizationId: orgOwnerA._id,
        invoiceNumber: 'INV-TEST-0001',
        customer: {
          customerId: customerA1._id,
          name: customerA1.name,
          phone: customerA1.phone
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            name: 'Test Product',
            SKU: 'SKU-001',
            quantity: 1,
            unitPrice: 500,
            subtotal: 500,
            total: 500
          }
        ],
        subtotal: 500,
        totalTax: 0,
        grandTotal: 500,
        paymentMethod: 'CREDIT',
        cashier: userOwnerA.id || userOwnerA._id
      });

      const res = await request(app)
        .delete(`/api/v1/customers/${customerA1._id}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deactivated).toBe(true);

      const check = await Customer.findById(customerA1._id);
      expect(check).not.toBeNull();
      expect(check.status).toBe('INACTIVE');
    });
  });

  describe('Customer Payments and Ledger', () => {
    it('should record payment towards outstanding balance and update balances', async () => {
      const payRes = await request(app)
        .post(`/api/v1/customers/${customerA1._id}/payments`)
        .set('Authorization', `Bearer ${tokenCashierA}`)
        .send({
          amount: 500,
          paymentMethod: 'UPI',
          notes: 'Google Pay transaction'
        });

      expect(payRes.status).toBe(201);
      expect(payRes.body.data.payment.amount).toBe(500);
      expect(payRes.body.data.customer.outstandingBalance).toBe(1000); // 1500 - 500
      expect(payRes.body.data.customer.totalPaid).toBe(500);

      // Verify payment receipt created
      const paymentDoc = await CustomerPayment.findOne({
        organizationId: orgOwnerA._id,
        customerId: customerA1._id
      });
      expect(paymentDoc).not.toBeNull();
      expect(paymentDoc.amount).toBe(500);
      expect(paymentDoc.receiptNumber).toMatch(/^RCP-/);
    });

    it('should return chronological customer ledger combining sales and payments', async () => {
      // Record a sale
      await Sale.create({
        organizationId: orgOwnerA._id,
        invoiceNumber: 'INV-TEST-0002',
        customer: {
          customerId: customerA1._id,
          name: customerA1.name
        },
        items: [
          {
            productId: new mongoose.Types.ObjectId(),
            name: 'Widget X',
            SKU: 'SKU-002',
            quantity: 2,
            unitPrice: 300,
            subtotal: 600,
            total: 600
          }
        ],
        subtotal: 600,
        totalTax: 0,
        grandTotal: 600,
        paymentMethod: 'CREDIT',
        cashier: userOwnerA.id || userOwnerA._id
      });

      // Record a payment
      await request(app)
        .post(`/api/v1/customers/${customerA1._id}/payments`)
        .set('Authorization', `Bearer ${tokenOwnerA}`)
        .send({
          amount: 600,
          paymentMethod: 'CASH'
        });

      const ledgerRes = await request(app)
        .get(`/api/v1/customers/${customerA1._id}/ledger`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(ledgerRes.status).toBe(200);
      expect(ledgerRes.body.data.ledger.length).toBe(2);
      expect(ledgerRes.body.data.ledger.some((e) => e.type === 'SALE')).toBe(true);
      expect(ledgerRes.body.data.ledger.some((e) => e.type === 'PAYMENT')).toBe(true);
    });

    it('should retrieve customer summary with order and balance stats', async () => {
      const sumRes = await request(app)
        .get(`/api/v1/customers/${customerA1._id}/summary`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(sumRes.status).toBe(200);
      expect(sumRes.body.data.name).toBe('Rajesh Sharma');
      expect(sumRes.body.data.outstandingBalance).toBe(1500);
      expect(sumRes.body.data.creditLimit).toBe(10000);
    });
  });
});
