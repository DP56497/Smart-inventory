const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Product = require('../src/models/Product');
const StockMovement = require('../src/models/StockMovement');
const Sale = require('../src/models/Sale');
const Customer = require('../src/models/Customer');
const User = require('../src/models/User');
const { generateAccessToken } = require('../src/utils/token');

require('./setup');

describe('Phase 6: POS System & Real Retail Checkout', () => {
  let tokenOwner;
  let userOwner;
  let orgOwner;

  let tokenCashier;
  let userCashier;

  let productA;
  let productB;
  let customerA;

  beforeEach(async () => {
    // 1. Register Owner
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Jane StoreOwner',
        email: 'owner@retail.com',
        password: 'Password123!',
        organizationName: 'Super Mart Retail',
        currency: 'INR'
      });
    tokenOwner = regRes.body.data.accessToken;
    userOwner = regRes.body.data.user;
    orgOwner = regRes.body.data.organization;

    // 2. Create a Cashier user under the same organization
    const cashierDoc = await User.create({
      name: 'Sam Cashier',
      email: 'sam.cashier@retail.com',
      password: 'HashedPassword123!',
      organizationId: orgOwner._id,
      role: 'CASHIER'
    });
    userCashier = cashierDoc;
    tokenCashier = generateAccessToken({
      id: cashierDoc._id,
      organizationId: orgOwner._id,
      role: 'CASHIER',
      email: cashierDoc.email
    });

    // 3. Create active products with known inventory
    const prodRes1 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({
        name: 'Wireless Bluetooth Mouse',
        SKU: 'MOU-BT-01',
        barcode: '8901234567890',
        purchasePrice: 300,
        sellingPrice: 500,
        taxPercentage: 18,
        currentStock: 25,
        minimumStock: 5
      });
    productA = prodRes1.body.data.product;

    const prodRes2 = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({
        name: 'Mechanical Gaming Keyboard',
        SKU: 'KB-MECH-RGB',
        barcode: '8909876543210',
        purchasePrice: 1500,
        sellingPrice: 2500,
        taxPercentage: 18,
        currentStock: 10,
        minimumStock: 2
      });
    productB = prodRes2.body.data.product;

    // 4. Create a regular customer
    const custRes = await request(app)
      .post('/api/v1/pos/customers')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({
        name: 'Rahul Sharma',
        phone: '9876543210',
        email: 'rahul@gmail.com',
        address: '123 MG Road, Bengaluru'
      });
    customerA = custRes.body.data;
  });

  describe('Server-Side Price, Tax, and Stock Calculation', () => {
    it('should complete sale, calculate authoritative prices & taxes server-side, and decrease inventory', async () => {
      const checkoutPayload = {
        items: [
          { productId: productA._id, quantity: 2 }, // 2 * 500 = 1000
          { productId: productB._id, quantity: 1 }  // 1 * 2500 = 2500
        ],
        customerId: customerA._id,
        paymentMethod: 'CASH',
        amountReceived: 5000,
        idempotencyKey: 'test-idemp-001'
      };

      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send(checkoutPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const sale = res.body.data;
      expect(sale.invoiceNumber).toMatch(/^INV-\d{8}-\d{4}$/);
      expect(sale.items.length).toBe(2);

      // Subtotal = (2 * 500) + (1 * 2500) = 3500
      expect(sale.subtotal).toBe(3500);

      // Tax = 18% of 3500 = 630
      expect(sale.totalTax).toBe(630);

      // Grand Total = 3500 + 630 = 4130
      expect(sale.grandTotal).toBe(4130);

      // Cash calculation
      expect(sale.amountReceived).toBe(5000);
      expect(sale.changeReturned).toBe(870); // 5000 - 4130 = 870
      expect(sale.paymentStatus).toBe('PAID');

      // Check product inventory was decreased
      const updatedProductA = await Product.findById(productA._id);
      expect(updatedProductA.currentStock).toBe(23); // 25 - 2 = 23

      const updatedProductB = await Product.findById(productB._id);
      expect(updatedProductB.currentStock).toBe(9); // 10 - 1 = 9

      // Check StockMovement records were created
      const movements = await StockMovement.find({ referenceId: sale.invoiceNumber });
      expect(movements.length).toBe(2);
      expect(movements[0].type).toBe('SALE');
      expect(movements[0].referenceType).toBe('POS_SALE');

      // Check customer stats were updated
      const updatedCustomer = await Customer.findById(customerA._id);
      expect(updatedCustomer.totalSpent).toBe(4130);
      expect(updatedCustomer.totalVisits).toBe(1);
    });

    it('should reject checkout when requested quantity exceeds available stock', async () => {
      const checkoutPayload = {
        items: [
          { productId: productB._id, quantity: 15 } // productB has only 10 in stock
        ],
        paymentMethod: 'CASH',
        amountReceived: 50000
      };

      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send(checkoutPayload);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INSUFFICIENT_STOCK');

      // Stock should remain unchanged
      const productDoc = await Product.findById(productB._id);
      expect(productDoc.currentStock).toBe(10);
    });

    it('should prevent duplicate submission using idempotency key', async () => {
      const idempotencyKey = 'unique-cart-uuid-12345';
      const checkoutPayload = {
        items: [{ productId: productA._id, quantity: 1 }],
        paymentMethod: 'UPI',
        idempotencyKey
      };

      // 1st request
      const res1 = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send(checkoutPayload);

      expect(res1.status).toBe(201);
      const invoiceNumber1 = res1.body.data.invoiceNumber;

      // Product stock decreased once
      const productDocAfterFirst = await Product.findById(productA._id);
      expect(productDocAfterFirst.currentStock).toBe(24);

      // 2nd identical request with same idempotency key
      const res2 = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send(checkoutPayload);

      expect(res2.status).toBe(200);
      expect(res2.body.data.invoiceNumber).toBe(invoiceNumber1);

      // Product stock must NOT be decremented twice!
      const productDocAfterSecond = await Product.findById(productA._id);
      expect(productDocAfterSecond.currentStock).toBe(24);

      // Only one sale document should exist
      const totalSales = await Sale.countDocuments({ idempotencyKey });
      expect(totalSales).toBe(1);
    });
  });

  describe('Discount Permissions and Role Enforcement', () => {
    it('should reject discount greater than 15% when applied by CASHIER', async () => {
      const checkoutPayload = {
        items: [{ productId: productA._id, quantity: 1 }], // subtotal = 500
        discountType: 'PERCENTAGE',
        discountValue: 20, // 20% > 15% limit
        paymentMethod: 'CASH',
        amountReceived: 1000
      };

      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenCashier}`)
        .send(checkoutPayload);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DISCOUNT_LIMIT_EXCEEDED');
    });

    it('should allow up to 15% discount for CASHIER', async () => {
      const checkoutPayload = {
        items: [{ productId: productA._id, quantity: 1 }], // 500
        discountType: 'PERCENTAGE',
        discountValue: 10, // 10% <= 15%
        paymentMethod: 'CASH',
        amountReceived: 1000
      };

      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenCashier}`)
        .send(checkoutPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.discountAmount).toBe(50); // 10% of 500
    });

    it('should allow higher discounts when applied by OWNER or MANAGER', async () => {
      const checkoutPayload = {
        items: [{ productId: productA._id, quantity: 1 }], // 500
        discountType: 'PERCENTAGE',
        discountValue: 30, // 30% discount
        paymentMethod: 'CASH',
        amountReceived: 1000
      };

      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send(checkoutPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.discountAmount).toBe(150); // 30% of 500
    });
  });

  describe('Payment Methods & Credit Sales', () => {
    it('should require a customer for CREDIT sales and increment customer creditBalance', async () => {
      // 1. Rejects credit sale if customerId is missing
      const resNoCust = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          items: [{ productId: productA._id, quantity: 1 }],
          paymentMethod: 'CREDIT'
        });

      expect(resNoCust.status).toBe(400);
      expect(resNoCust.body.code).toBe('CUSTOMER_REQUIRED_FOR_CREDIT');

      // 2. Succeeds when customer is provided
      const resWithCust = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          items: [{ productId: productA._id, quantity: 1 }],
          customerId: customerA._id,
          paymentMethod: 'CREDIT'
        });

      expect(resWithCust.status).toBe(201);
      expect(resWithCust.body.data.paymentStatus).toBe('PENDING');

      const updatedCust = await Customer.findById(customerA._id);
      expect(updatedCust.creditBalance).toBe(resWithCust.body.data.grandTotal);
    });

    it('should reject CASH payment when amount received is insufficient', async () => {
      const res = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          items: [{ productId: productA._id, quantity: 1 }], // grandTotal = 590
          paymentMethod: 'CASH',
          amountReceived: 500 // less than 590
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INSUFFICIENT_PAYMENT');
    });
  });

  describe('POS Product Catalog Search & Sales History', () => {
    it('should search products by barcode or SKU for instant cashier scanning', async () => {
      // Exact barcode search
      const resBarcode = await request(app)
        .get('/api/v1/pos/products?barcode=8901234567890')
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(resBarcode.status).toBe(200);
      expect(resBarcode.body.data.length).toBe(1);
      expect(resBarcode.body.data[0].SKU).toBe('MOU-BT-01');

      // SKU search
      const resSku = await request(app)
        .get('/api/v1/pos/products?search=KB-MECH')
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(resSku.status).toBe(200);
      expect(resSku.body.data.length).toBe(1);
      expect(resSku.body.data[0].name).toBe('Mechanical Gaming Keyboard');
    });

    it('should retrieve paginated sales history with invoice filtering', async () => {
      // Create a sale first
      const checkoutRes = await request(app)
        .post('/api/v1/pos/checkout')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          items: [{ productId: productA._id, quantity: 1 }],
          paymentMethod: 'UPI'
        });

      const invNum = checkoutRes.body.data.invoiceNumber;

      const historyRes = await request(app)
        .get(`/api/v1/pos/sales?search=${invNum}`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data.length).toBe(1);
      expect(historyRes.body.data[0].invoiceNumber).toBe(invNum);
      expect(historyRes.body.meta.total).toBe(1);

      // Single sale retrieval
      const singleRes = await request(app)
        .get(`/api/v1/pos/sales/${checkoutRes.body.data._id}`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(singleRes.status).toBe(200);
      expect(singleRes.body.data.invoiceNumber).toBe(invNum);
    });
  });
});
