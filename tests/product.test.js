const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const Brand = require('../src/models/Brand');
const Unit = require('../src/models/Unit');

require('./setup');

describe('Phase 3: Product Management - Multi-Tenant & Query Scoping', () => {
  let tokenA;
  let userA;
  let orgA;

  let tokenB;
  let userB;
  let orgB;

  let categoryA;
  let brandA;
  let unitA;

  beforeEach(async () => {
    // 1. Register Tenant A
    const resA = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Owner',
        email: 'alice@alpha.com',
        password: 'Password123!',
        organizationName: 'Alpha Store',
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
        email: 'bob@beta.com',
        password: 'Password123!',
        organizationName: 'Beta Store',
        currency: 'EUR'
      });
    tokenB = resB.body.data.accessToken;
    userB = resB.body.data.user;
    orgB = resB.body.data.organization;

    // 3. Create Category, Brand, Unit for Tenant A
    const catRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Electronics', description: 'Gadgets & Devices' });
    categoryA = catRes.body.data.category;

    const brandRes = await request(app)
      .post('/api/brands')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Acme Corp', description: 'High quality goods' });
    brandA = brandRes.body.data.brand;

    const unitRes = await request(app)
      .post('/api/units')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Units', code: 'UNT' });
    unitA = unitRes.body.data.unit;
  });

  describe('1. Product Creation & Anti-Spoofing', () => {
    it('should create product with tenant scoping and strip client organizationId', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Wireless Mouse',
          SKU: 'WM-001',
          barcode: '8901234567890',
          categoryId: categoryA._id,
          brandId: brandA._id,
          unitId: unitA._id,
          purchasePrice: 15.5,
          sellingPrice: 29.99,
          taxPercentage: 18,
          currentStock: 50,
          minimumStock: 10,
          maximumStock: 100,
          reorderLevel: 15,
          description: 'Ergonomic 2.4G wireless mouse',
          organizationId: orgB._id // ATTACK: attempt to spoof tenant
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.name).toBe('Wireless Mouse');
      expect(res.body.data.product.SKU).toBe('WM-001');
      expect(res.body.data.product.organizationId.toString()).toBe(orgA._id.toString());
      expect(res.body.data.product.organizationId.toString()).not.toBe(orgB._id.toString());
      expect(res.body.data.product.createdBy._id.toString()).toBe(userA.id.toString());
    });

    it('should enforce SKU uniqueness per organization but allow across different organizations', async () => {
      // Create WM-001 in Org A
      const resA1 = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Wireless Mouse',
          SKU: 'WM-001',
          purchasePrice: 10,
          sellingPrice: 20
        });
      expect(resA1.status).toBe(201);

      // Attempt duplicate SKU WM-001 in Org A -> Reject 409
      const resA2 = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Another Mouse',
          SKU: 'wm-001', // case-insensitive check
          purchasePrice: 12,
          sellingPrice: 22
        });
      expect(resA2.status).toBe(409);

      // Create same SKU WM-001 in Org B -> Succeeded (tenant isolation)
      const resB = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: 'Beta Mouse',
          SKU: 'WM-001',
          purchasePrice: 15,
          sellingPrice: 30
        });
      expect(resB.status).toBe(201);
    });

    it('should reject foreign category that does not belong to the organization', async () => {
      // Tenant B tries to use categoryA from Tenant A
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: 'Smart Watch',
          SKU: 'SW-001',
          categoryId: categoryA._id,
          purchasePrice: 50,
          sellingPrice: 99
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CATEGORY');
    });
  });

  describe('2. Multi-Tenant Query & Access Isolation', () => {
    let productA;
    let productB;

    beforeEach(async () => {
      const resA = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Mechanical Keyboard',
          SKU: 'MK-100',
          barcode: '111122223333',
          purchasePrice: 40,
          sellingPrice: 79.99,
          currentStock: 25,
          reorderLevel: 5
        });
      productA = resA.body.data.product;

      const resB = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          name: 'Gaming Headset',
          SKU: 'GH-200',
          barcode: '444455556666',
          purchasePrice: 30,
          sellingPrice: 59.99,
          currentStock: 10,
          reorderLevel: 2
        });
      productB = resB.body.data.product;
    });

    it('should never list products of another tenant', async () => {
      // Tenant A queries
      const resA = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data.products.length).toBe(1);
      expect(resA.body.data.products[0].SKU).toBe('MK-100');

      // Tenant B queries
      const resB = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.products.length).toBe(1);
      expect(resB.body.data.products[0].SKU).toBe('GH-200');
    });

    it('should deny cross-tenant GET by ID', async () => {
      const res = await request(app)
        .get(`/api/products/${productB._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
    });

    it('should deny cross-tenant PATCH', async () => {
      const res = await request(app)
        .patch(`/api/products/${productB._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ sellingPrice: 1.0 });

      expect(res.status).toBe(404);
      // Verify product B was NOT modified
      const check = await Product.findById(productB._id);
      expect(check.sellingPrice).toBe(59.99);
    });

    it('should deny cross-tenant DELETE', async () => {
      const res = await request(app)
        .delete(`/api/products/${productB._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      // Verify product B still exists
      const check = await Product.findById(productB._id);
      expect(check).not.toBeNull();
    });
  });

  describe('3. Filtering, Search, Sorting, and Pagination', () => {
    beforeEach(async () => {
      // Seed several products for Org A
      const items = [
        {
          name: 'Pro Laptop 15',
          SKU: 'LAP-001',
          barcode: '990001',
          categoryId: categoryA._id,
          brandId: brandA._id,
          purchasePrice: 800,
          sellingPrice: 1200,
          currentStock: 4,
          reorderLevel: 5 // Low stock
        },
        {
          name: 'Pro Laptop 17',
          SKU: 'LAP-002',
          barcode: '990002',
          categoryId: categoryA._id,
          purchasePrice: 1000,
          sellingPrice: 1500,
          currentStock: 0,
          reorderLevel: 5 // Out of stock
        },
        {
          name: 'USB-C Cable 2M',
          SKU: 'CBL-001',
          barcode: '990003',
          brandId: brandA._id,
          purchasePrice: 3,
          sellingPrice: 10,
          currentStock: 100,
          reorderLevel: 20
        },
        {
          name: 'Wireless Charger',
          SKU: 'CHG-001',
          barcode: '990004',
          purchasePrice: 15,
          sellingPrice: 35,
          currentStock: 2,
          reorderLevel: 10 // Low stock
        }
      ];

      for (const item of items) {
        await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${tokenA}`)
          .send(item);
      }
    });

    it('should filter by search term', async () => {
      const res = await request(app)
        .get('/api/products?search=Laptop')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(2);
    });

    it('should filter by barcode', async () => {
      const res = await request(app)
        .get('/api/products?barcode=990003')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(1);
      expect(res.body.data.products[0].SKU).toBe('CBL-001');
    });

    it('should filter by SKU', async () => {
      const res = await request(app)
        .get('/api/products?sku=CHG-001')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(1);
      expect(res.body.data.products[0].name).toBe('Wireless Charger');
    });

    it('should filter by category', async () => {
      const res = await request(app)
        .get(`/api/products?categoryId=${categoryA._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(2);
    });

    it('should filter by brand', async () => {
      const res = await request(app)
        .get(`/api/products?brandId=${brandA._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(2);
    });

    it('should filter by low-stock', async () => {
      const res = await request(app)
        .get('/api/products?lowStock=true')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      // Should include Pro Laptop 15 (stock: 4 <= 5) and Wireless Charger (stock: 2 <= 10)
      expect(res.body.data.products.length).toBe(2);
      const skus = res.body.data.products.map((p) => p.SKU);
      expect(skus).toContain('LAP-001');
      expect(skus).toContain('CHG-001');
    });

    it('should filter by out-of-stock', async () => {
      const res = await request(app)
        .get('/api/products?outOfStock=true')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(1);
      expect(res.body.data.products[0].SKU).toBe('LAP-002');
    });

    it('should paginate results and include metadata', async () => {
      const res = await request(app)
        .get('/api/products?page=1&limit=2')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBe(2);
      expect(res.body.meta).toEqual(
        expect.objectContaining({
          page: 1,
          limit: 2,
          total: 4,
          totalPages: 2,
          hasNextPage: true,
          hasPrevPage: false
        })
      );
    });

    it('should sort products by sellingPrice ascending', async () => {
      const res = await request(app)
        .get('/api/products?sortBy=sellingPrice&sortOrder=asc')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.products[0].SKU).toBe('CBL-001'); // 10
      expect(res.body.data.products[res.body.data.products.length - 1].SKU).toBe('LAP-002'); // 1500
    });
  });

  describe('4. Update and Delete Operations', () => {
    let createdProduct;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Tablet Stand',
          SKU: 'TS-001',
          purchasePrice: 8,
          sellingPrice: 19.99,
          currentStock: 20
        });
      createdProduct = res.body.data.product;
    });

    it('should update product details and set updatedBy', async () => {
      const res = await request(app)
        .patch(`/api/products/${createdProduct._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Adjustable Tablet Stand Pro',
          sellingPrice: 24.99,
          currentStock: 25
        });

      expect(res.status).toBe(200);
      expect(res.body.data.product.name).toBe('Adjustable Tablet Stand Pro');
      expect(res.body.data.product.sellingPrice).toBe(24.99);
      // Phase 4 enforces no direct stock modification: currentStock remains unchanged
      expect(res.body.data.product.currentStock).toBe(20);
      expect(res.body.data.product.updatedBy._id.toString()).toBe(userA.id.toString());
    });

    it('should delete product successfully', async () => {
      const res = await request(app)
        .delete(`/api/products/${createdProduct._id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deletion
      const fetchRes = await request(app)
        .get(`/api/products/${createdProduct._id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(fetchRes.status).toBe(404);
    });
  });
});
