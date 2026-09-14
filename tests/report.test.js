const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Product = require('../src/models/Product');
const Supplier = require('../src/models/Supplier');
const Customer = require('../src/models/Customer');
const Sale = require('../src/models/Sale');
const Purchase = require('../src/models/Purchase');
const User = require('../src/models/User');
const { generateAccessToken } = require('../src/utils/token');

require('./setup');

describe('Module: Reports & Analytics', () => {
  let tokenOwnerA;
  let userOwnerA;
  let orgOwnerA;

  let tokenCashierA;
  let userCashierA;

  let tokenOwnerB;
  let userOwnerB;
  let orgOwnerB;

  let product1;
  let product2;
  let customer1;
  let supplier1;

  beforeEach(async () => {
    // 1. Register Tenant A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Report Admin',
        email: 'admin.report@alpha.com',
        password: 'Password123!',
        organizationName: 'Alpha Retailers',
        currency: 'INR'
      });
    tokenOwnerA = resA.body.data.accessToken;
    userOwnerA = resA.body.data.user;
    orgOwnerA = resA.body.data.organization;

    // 2. Cashier under Tenant A
    const cashierDoc = await User.create({
      name: 'Cashier Staff',
      email: 'staff.report@alpha.com',
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

    // 3. Register Tenant B
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Beta Boss',
        email: 'boss.report@beta.com',
        password: 'Password123!',
        organizationName: 'Beta Store',
        currency: 'USD'
      });
    tokenOwnerB = resB.body.data.accessToken;
    userOwnerB = resB.body.data.user;
    orgOwnerB = resB.body.data.organization;

    // 4. Create products
    product1 = await Product.create({
      name: 'Mechanical Keyboard',
      SKU: 'KB-MECH',
      purchasePrice: 2000,
      sellingPrice: 3500,
      currentStock: 25,
      reorderLevel: 5,
      organizationId: orgOwnerA._id,
      createdBy: userOwnerA.id
    });

    product2 = await Product.create({
      name: 'Wireless Mouse',
      SKU: 'MS-WIRELESS',
      purchasePrice: 500,
      sellingPrice: 1000,
      currentStock: 4, // low stock
      reorderLevel: 10,
      organizationId: orgOwnerA._id,
      createdBy: userOwnerA.id
    });

    // 5. Create customer & supplier
    customer1 = await Customer.create({
      name: 'John Doe',
      phone: '9988776655',
      creditBalance: 1500,
      organizationId: orgOwnerA._id,
      createdBy: userOwnerA.id
    });

    supplier1 = await Supplier.create({
      name: 'Tech Distributors',
      companyName: 'TechDistro Pvt',
      outstandingPayable: 4500,
      organizationId: orgOwnerA._id,
      createdBy: userOwnerA.id
    });

    // 6. Create completed sale for Tenant A
    await Sale.create({
      organizationId: orgOwnerA._id,
      invoiceNumber: 'INV-20260912-0001',
      customer: {
        customerId: customer1._id,
        name: customer1.name,
        phone: customer1.phone
      },
      items: [
        {
          productId: product1._id,
          name: product1.name,
          SKU: product1.SKU,
          quantity: 2,
          unitPrice: 3500,
          purchasePrice: 2000,
          subtotal: 7000,
          total: 7000
        },
        {
          productId: product2._id,
          name: product2.name,
          SKU: product2.SKU,
          quantity: 1,
          unitPrice: 1000,
          purchasePrice: 500,
          subtotal: 1000,
          total: 1000
        }
      ],
      subtotal: 8000,
      totalTax: 0,
      grandTotal: 8000,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      cashier: userOwnerA.id
    });

    // 7. Create purchase record for Tenant A
    await Purchase.create({
      organizationId: orgOwnerA._id,
      purchaseNumber: 'PO-20260912-0001',
      supplierId: supplier1._id,
      items: [
        {
          productId: product1._id,
          name: product1.name,
          SKU: product1.SKU,
          quantity: 10,
          unitCost: 2000,
          subtotal: 20000,
          total: 20000
        }
      ],
      subtotal: 20000,
      totalTax: 0,
      grandTotal: 20000,
      paidAmount: 15500,
      paymentStatus: 'PARTIALLY_PAID',
      status: 'RECEIVED',
      createdBy: userOwnerA.id
    });
  });

  describe('GET /api/v1/reports/financial', () => {
    it('should generate financial summary with revenue, COGS, and profit margins', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial?filter=30_DAYS')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { overview, balanceSheetSnapshot } = res.body.data;
      expect(overview.revenue).toBe(8000);
      // COGS = (2 * 2000) + (1 * 500) = 4500
      expect(overview.cogs).toBe(4500);
      expect(overview.grossProfit).toBe(3500);
      expect(overview.profitMargin).toBe(43.8); // 3500 / 8000 * 100 = 43.75% -> 43.8%
      expect(overview.totalPurchases).toBe(20000);

      expect(balanceSheetSnapshot.outstandingReceivables).toBe(1500);
      expect(balanceSheetSnapshot.outstandingPayables).toBe(4500);
    });

    it('should deny access to CASHIER', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial')
        .set('Authorization', `Bearer ${tokenCashierA}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/reports/sales', () => {
    it('should return sales trend, payment method distribution, and top products', async () => {
      const res = await request(app)
        .get('/api/v1/reports/sales?filter=30_DAYS')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.paymentMethods).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: 'UPI', amount: 8000, count: 1 })
        ])
      );
      expect(res.body.data.topProducts).toHaveLength(2);
      expect(res.body.data.topProducts[0].name).toBe('Mechanical Keyboard');
      expect(res.body.data.topProducts[0].totalRevenue).toBe(7000);
    });
  });

  describe('GET /api/v1/reports/inventory', () => {
    it('should return inventory valuation and stock health distribution', async () => {
      const res = await request(app)
        .get('/api/v1/reports/inventory')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      const { summary } = res.body.data;
      expect(summary.totalItems).toBe(2);
      expect(summary.lowStockCount).toBe(1); // product2 has stock 4 <= reorderLevel 10
      expect(summary.inStockCount).toBe(1); // product1 has stock 25 > reorderLevel 5
      expect(summary.costValuation).toBe(25 * 2000 + 4 * 500); // 50000 + 2000 = 52000
    });
  });

  describe('GET /api/v1/reports/purchases', () => {
    it('should return supplier purchases breakdown and order statistics', async () => {
      const res = await request(app)
        .get('/api/v1/reports/purchases?filter=30_DAYS')
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.suppliers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Tech Distributors',
            totalSpend: 20000,
            ordersCount: 1
          })
        ])
      );
    });
  });

  describe('Tenant Isolation in Reports', () => {
    it('should return empty/zero metrics for Tenant B with no sales', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial?filter=30_DAYS')
        .set('Authorization', `Bearer ${tokenOwnerB}`);

      expect(res.status).toBe(200);
      expect(res.body.data.overview.revenue).toBe(0);
      expect(res.body.data.overview.grossProfit).toBe(0);
      expect(res.body.data.balanceSheetSnapshot.outstandingReceivables).toBe(0);
    });
  });
});
