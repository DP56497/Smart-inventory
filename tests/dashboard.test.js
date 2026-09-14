const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Product = require('../src/models/Product');
const Sale = require('../src/models/Sale');
const Purchase = require('../src/models/Purchase');
const Customer = require('../src/models/Customer');
const Supplier = require('../src/models/Supplier');
const User = require('../src/models/User');
const { generateAccessToken } = require('../src/utils/token');

require('./setup');

describe('Dashboard Analytics & Aggregation Engine', () => {
  let tokenOwnerA;
  let userOwnerA;
  let orgOwnerA;

  let tokenCashierA;
  let userCashierA;

  let tokenOwnerB;
  let userOwnerB;
  let orgOwnerB;

  let productA1;
  let productA2;
  let productB1;

  beforeEach(async () => {
    // 1. Register Tenant A (Owner)
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Owner',
        email: 'alice@dashboard.com',
        password: 'Password123!',
        organizationName: 'Alpha Electronics',
        currency: 'INR'
      });
    tokenOwnerA = resA.body.data.accessToken;
    userOwnerA = resA.body.data.user;
    orgOwnerA = resA.body.data.organization;

    // 2. Create Cashier under Tenant A
    const cashierDoc = await User.create({
      name: 'Charlie Cashier',
      email: 'charlie@dashboard.com',
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

    // 3. Register Tenant B (Isolation Check)
    const resB = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Owner',
        email: 'bob@dashboard.com',
        password: 'Password123!',
        organizationName: 'Beta Retail',
        currency: 'USD'
      });
    tokenOwnerB = resB.body.data.accessToken;
    userOwnerB = resB.body.data.user;
    orgOwnerB = resB.body.data.organization;

    // 4. Products for Tenant A
    // Product A1: 20 units, purchasePrice 100, sellingPrice 200, reorderLevel 5
    const prodRes1 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokenOwnerA}`)
      .send({
        name: 'USB-C Fast Cable',
        SKU: 'CAB-USBC-01',
        purchasePrice: 100,
        sellingPrice: 200,
        taxPercentage: 18,
        currentStock: 20,
        minimumStock: 5,
        reorderLevel: 5
      });
    productA1 = prodRes1.body.data.product;

    // Product A2 (Low stock): 3 units, purchasePrice 500, sellingPrice 1000, reorderLevel 5
    const prodRes2 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokenOwnerA}`)
      .send({
        name: 'Fast Wireless Charger',
        SKU: 'CHG-WRLS-02',
        purchasePrice: 500,
        sellingPrice: 1000,
        taxPercentage: 18,
        currentStock: 3,
        minimumStock: 5,
        reorderLevel: 5
      });
    productA2 = prodRes2.body.data.product;

    // 5. Product for Tenant B
    const prodResB = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokenOwnerB}`)
      .send({
        name: 'Tenant B Secret Item',
        SKU: 'SEC-B-01',
        purchasePrice: 1000,
        sellingPrice: 5000,
        currentStock: 50
      });
    productB1 = prodResB.body.data.product;

    // 6. Create Customer & Supplier for Tenant A
    await Customer.create({
      organizationId: orgOwnerA._id,
      name: 'Pooja Verma',
      phone: '9876543210',
      creditBalance: 250
    });

    await Supplier.create({
      organizationId: orgOwnerA._id,
      name: 'Global Tech Suppliers',
      companyName: 'Global Tech Ltd',
      phone: '9988776655'
    });

    // 7. Complete a Sale for Tenant A
    await request(app)
      .post('/api/v1/pos/checkout')
      .set('Authorization', `Bearer ${tokenOwnerA}`)
      .send({
        items: [
          { productId: productA1._id, quantity: 2 }, // revenue: 400, tax: 72, total: 472, cogs: 200
          { productId: productA2._id, quantity: 1 }  // revenue: 1000, tax: 180, total: 1180, cogs: 500
        ],
        paymentMethod: 'CASH',
        amountReceived: 2000
      });

    // 8. Create a Purchase for Tenant A
    await Purchase.create({
      organizationId: orgOwnerA._id,
      purchaseNumber: 'PO-20260910-0001',
      items: [
        {
          productId: productA1._id,
          name: productA1.name,
          SKU: productA1.SKU,
          quantity: 10,
          unitCost: 100,
          subtotal: 1000,
          total: 1000
        }
      ],
      subtotal: 1000,
      grandTotal: 1000,
      status: 'RECEIVED',
      createdBy: userOwnerA.id || userOwnerA._id
    });
  });

  it('should return aggregated KPI metrics and charts for Owner', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats?filter=TODAY')
      .set('Authorization', `Bearer ${tokenOwnerA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    const { kpi, charts } = data;

    // 1. Sales & Profit calculations
    // Sale subtotal = 1400 (400 + 1000)
    // Sale tax = 252 (72 + 180)
    // Grand Total = 1652
    // COGS = 700 (2*100 + 1*500)
    // Profit = 1400 - 700 = 700
    expect(kpi.todaySales).toBe(1652);
    expect(kpi.todaySalesCount).toBe(1);
    expect(kpi.todayProfit).toBe(700);
    expect(kpi.todayPurchases).toBe(1000);

    // 2. Inventory & Stock Valuations
    expect(kpi.totalProducts).toBe(2);
    expect(kpi.lowStock).toBe(1); // productA2 stock is 2 (below 5)
    expect(kpi.outOfStock).toBe(0);

    // 3. Customers & Suppliers
    expect(kpi.customers).toBe(1);
    expect(kpi.suppliers).toBe(1);

    // 4. Charts Data
    expect(charts.trends.length).toBeGreaterThan(0);
    expect(charts.topSellingProducts.length).toBe(2);
    expect(charts.paymentMethods.length).toBe(1);
    expect(charts.paymentMethods[0].method).toBe('CASH');
    expect(charts.lowStockProducts.length).toBe(1);
    expect(charts.lowStockProducts[0].name).toBe('Fast Wireless Charger');
  });

  it('should strictly isolate metrics between different tenants', async () => {
    const resB = await request(app)
      .get('/api/v1/dashboard/stats?filter=TODAY')
      .set('Authorization', `Bearer ${tokenOwnerB}`);

    expect(resB.status).toBe(200);
    const kpiB = resB.body.data.kpi;

    // Tenant B should have 0 sales, 0 purchases, 0 profit
    expect(kpiB.todaySales).toBe(0);
    expect(kpiB.todayPurchases).toBe(0);
    expect(kpiB.todayProfit).toBe(0);
    expect(kpiB.totalProducts).toBe(1); // Only its own product
    expect(kpiB.customers).toBe(0);
  });

  it('should respect CASHIER role permissions by masking sensitive profit and purchase metrics', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/stats?filter=TODAY')
      .set('Authorization', `Bearer ${tokenCashierA}`);

    expect(res.status).toBe(200);
    const kpi = res.body.data.kpi;

    // Cashier sees sales and operational counts
    expect(kpi.todaySales).toBe(1652);
    expect(kpi.todaySalesCount).toBe(1);
    expect(kpi.totalProducts).toBe(2);

    // Sensitive business profits and purchases are masked
    expect(kpi.todayProfit).toBe(0);
    expect(kpi.todayPurchases).toBe(0);
    expect(kpi.totalStockValuePurchase).toBe(0);
    expect(kpi.suppliers).toBe(0);
  });

  it('should support various date filters (TODAY, 7_DAYS, THIS_MONTH, THIS_YEAR)', async () => {
    const filters = ['TODAY', 'YESTERDAY', '7_DAYS', '30_DAYS', 'THIS_MONTH', 'THIS_YEAR'];

    for (const f of filters) {
      const res = await request(app)
        .get(`/api/v1/dashboard/stats?filter=${f}`)
        .set('Authorization', `Bearer ${tokenOwnerA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.dateRange.filter).toBe(f);
      expect(res.body.data.kpi).toBeDefined();
    }
  });
});
