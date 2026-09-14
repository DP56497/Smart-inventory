const request = require('supertest');
const app = require('../src/app');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const { ROLES } = require('../src/constants/roles');
const { verifyAccessToken } = require('../src/utils/token');

require('./setup');

describe('Phase 1: Multi-Tenant Architecture & Authentication Integration', () => {
  const tenantAData = {
    name: 'Aarav Patel',
    email: 'aarav@alpha-retail.com',
    password: 'Password123!',
    organizationName: 'Alpha Supermarket',
    phone: '+919876543210',
    gstin: '24AAAAA0000A1Z5',
    currency: 'INR',
    timezone: 'Asia/Kolkata'
  };

  const tenantBData = {
    name: 'Bhavin Shah',
    email: 'bhavin@beta-hardware.com',
    password: 'Password123!',
    organizationName: 'Beta Hardware Stores',
    phone: '+919876543211',
    gstin: '24BBBBB0000B1Z6',
    currency: 'INR',
    timezone: 'Asia/Kolkata'
  };

  describe('1. Organization & Owner Registration', () => {
    it('should register owner and create organization with tenant isolation', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(tenantAData);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.role).toBe(ROLES.OWNER);
      expect(res.body.data.organization.name).toBe('Alpha Supermarket');
      expect(res.body.data.organization.currency).toBe('INR');

      // Verify token payload embeds organizationId and role
      const decoded = verifyAccessToken(res.body.data.accessToken);
      expect(decoded.id).toBe(res.body.data.user.id);
      expect(decoded.organizationId).toBe(res.body.data.organization._id.toString());
      expect(decoded.role).toBe(ROLES.OWNER);

      // Verify database persistence
      const orgInDb = await Organization.findById(res.body.data.organization._id);
      expect(orgInDb).not.toBeNull();
      expect(orgInDb.ownerId.toString()).toBe(res.body.data.user.id);

      const userInDb = await User.findById(res.body.data.user.id);
      expect(userInDb).not.toBeNull();
      expect(userInDb.organizationId.toString()).toBe(orgInDb._id.toString());
    });

    it('should prevent duplicate registration with existing email', async () => {
      await request(app).post('/api/v1/auth/register').send(tenantAData);

      const duplicateRes = await request(app)
        .post('/api/v1/auth/register')
        .send(tenantAData);

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.success).toBe(false);
      expect(duplicateRes.body.code).toBe('EMAIL_EXISTS');
    });
  });

  describe('2. Login & Token Refresh with Tenant Scoping', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(tenantAData);
    });

    it('should login and return access token with organizationId', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: tenantAData.email,
          password: tenantAData.password
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');

      const decoded = verifyAccessToken(res.body.data.accessToken);
      expect(decoded.organizationId).toBeDefined();
      expect(decoded.role).toBe(ROLES.OWNER);
    });

    it('should reject invalid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: tenantAData.email,
          password: 'WrongPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should refresh access token using valid refresh token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: tenantAData.email,
          password: tenantAData.password
        });

      const { refreshToken } = loginRes.body.data;

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh-token')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data).toHaveProperty('accessToken');
      expect(refreshRes.body.data).toHaveProperty('refreshToken');

      const decoded = verifyAccessToken(refreshRes.body.data.accessToken);
      expect(decoded.organizationId).toBeDefined();
    });
  });

  describe('3. Unauthorized Access Protection', () => {
    it('should reject request when no Bearer token is provided', async () => {
      const res = await request(app).get('/api/v1/organization/profile');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('should reject request with an invalid/tampered token', async () => {
      const res = await request(app)
        .get('/api/v1/organization/profile')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('4. Cross-Tenant Isolation Enforcement', () => {
    let tenantAToken;
    let tenantBToken;
    let tenantAOrgId;
    let tenantBOrgId;

    beforeEach(async () => {
      // Register Tenant A
      const resA = await request(app).post('/api/v1/auth/register').send(tenantAData);
      tenantAToken = resA.body.data.accessToken;
      tenantAOrgId = resA.body.data.organization._id;

      // Register Tenant B
      const resB = await request(app).post('/api/v1/auth/register').send(tenantBData);
      tenantBToken = resB.body.data.accessToken;
      tenantBOrgId = resB.body.data.organization._id;
    });

    it('should ensure Tenant A only sees their own organization profile', async () => {
      const res = await request(app)
        .get('/api/v1/organization/profile')
        .set('Authorization', `Bearer ${tenantAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.organization._id).toBe(tenantAOrgId);
      expect(res.body.data.organization.name).toBe('Alpha Supermarket');
    });

    it('should ensure Tenant B only sees their own organization profile', async () => {
      const res = await request(app)
        .get('/api/v1/organization/profile')
        .set('Authorization', `Bearer ${tenantBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.organization._id).toBe(tenantBOrgId);
      expect(res.body.data.organization.name).toBe('Beta Hardware Stores');
    });

    it('should strictly PREVENT Tenant A from spoofing or modifying Tenant B data via payload', async () => {
      // Tenant A tries to inject Tenant B's organizationId in the update request
      const maliciousPayload = {
        name: 'Hacked Organization Name',
        organizationId: tenantBOrgId // Attempted spoofing
      };

      const res = await request(app)
        .patch('/api/v1/organization/profile')
        .set('Authorization', `Bearer ${tenantAToken}`)
        .send(maliciousPayload);

      expect(res.status).toBe(200);

      // Verify that Tenant A updated ONLY Tenant A
      expect(res.body.data.organization._id).toBe(tenantAOrgId);
      expect(res.body.data.organization.name).toBe('Hacked Organization Name');

      // Verify Tenant B was NOT touched at all
      const tenantBInDb = await Organization.findById(tenantBOrgId);
      expect(tenantBInDb.name).toBe('Beta Hardware Stores');
    });
  });

  describe('5. Role-Based Access Control (RBAC)', () => {
    let ownerToken;
    let cashierToken;

    beforeEach(async () => {
      // Register Owner
      const regRes = await request(app).post('/api/v1/auth/register').send(tenantAData);
      ownerToken = regRes.body.data.accessToken;
      const orgId = regRes.body.data.organization._id;

      // Create a Cashier user under the same organization
      const cashierUser = await User.create({
        name: 'Cashier John',
        email: 'john.cashier@alpha-retail.com',
        password: 'hashedPassword123',
        organizationId: orgId,
        role: ROLES.CASHIER,
        status: 'ACTIVE'
      });

      // Generate token for cashier
      const { generateAccessToken } = require('../src/utils/token');
      cashierToken = generateAccessToken({
        id: cashierUser._id.toString(),
        organizationId: orgId.toString(),
        role: ROLES.CASHIER,
        email: cashierUser.email
      });
    });

    it('should allow OWNER to update organization settings', async () => {
      const res = await request(app)
        .patch('/api/v1/organization/settings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          inventorySettings: {
            enableNegativeInventory: true,
            lowStockAlertThreshold: 15
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.data.settings.inventorySettings.enableNegativeInventory).toBe(true);
      expect(res.body.data.settings.inventorySettings.lowStockAlertThreshold).toBe(15);
    });

    it('should DENY CASHIER from modifying organization settings', async () => {
      const res = await request(app)
        .patch('/api/v1/organization/settings')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          inventorySettings: {
            enableNegativeInventory: true
          }
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('FORBIDDEN');
    });
  });
});
