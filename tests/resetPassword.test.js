const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Organization = require('../src/models/Organization');
const { hashToken } = require('../src/utils/token');

require('./setup');

describe('Authentication: Secure Forgot & Reset Password Flow', () => {
  let testUser;
  let testOrg;
  const initialPassword = 'OriginalPassword123!';
  const updatedPassword = 'NewSecurePassword456#';

  beforeEach(async () => {
    // Register an initial test user and organization
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alex Retailer',
        email: 'alex@inventory-test.io',
        password: initialPassword,
        organizationName: 'Alex Retail Ltd'
      });

    expect(regRes.status).toBe(201);
    testUser = await User.findOne({ email: 'alex@inventory-test.io' });
    testOrg = await Organization.findOne({ _id: testUser.organizationId });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should generate a hashed token and expiry in DB for registered user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'alex@inventory-test.io' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('password reset instructions have been sent');
      expect(res.body.data.devResetToken).toBeDefined();

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.passwordResetToken).toBeDefined();
      expect(updatedUser.passwordResetExpires).toBeDefined();

      // Verify that the stored token in DB is the SHA-256 hash of the raw token
      const expectedHash = hashToken(res.body.data.devResetToken);
      expect(updatedUser.passwordResetToken).toBe(expectedHash);

      // Verify expiration is in the future (~15 mins)
      expect(new Date(updatedUser.passwordResetExpires).getTime()).toBeGreaterThan(Date.now());
    });

    it('should return identical success message for non-registered email (anti-enumeration)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@random-store.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('password reset instructions have been sent');
      expect(res.body.data.devResetToken).toBeUndefined();
    });

    it('should reject invalid email format with 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    let rawResetToken;

    beforeEach(async () => {
      const forgotRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'alex@inventory-test.io' });

      rawResetToken = forgotRes.body.data.devResetToken;
    });

    it('should successfully reset password with valid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawResetToken,
          password: updatedPassword
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Password has been reset successfully');

      // Verify database state: reset token cleared, refresh token invalidated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.passwordResetToken).toBeNull();
      expect(updatedUser.passwordResetExpires).toBeNull();
      expect(updatedUser.refreshToken).toBeNull();

      // Verify login with old password fails
      const oldLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alex@inventory-test.io',
          password: initialPassword
        });
      expect(oldLoginRes.status).toBe(401);

      // Verify login with new password succeeds
      const newLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alex@inventory-test.io',
          password: updatedPassword
        });
      expect(newLoginRes.status).toBe(200);
      expect(newLoginRes.body.data.accessToken).toBeDefined();
    });

    it('should prevent token reuse (one-time use security)', async () => {
      // First reset succeeds
      const firstRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawResetToken,
          password: updatedPassword
        });
      expect(firstRes.status).toBe(200);

      // Second reset with the same token must fail
      const secondRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawResetToken,
          password: 'AnotherPassword789$'
        });
      expect(secondRes.status).toBe(400);
      expect(secondRes.body.code).toBe('INVALID_RESET_TOKEN');
    });

    it('should reject expired reset token', async () => {
      // Artificially expire the token in MongoDB
      await User.findByIdAndUpdate(testUser._id, {
        passwordResetExpires: new Date(Date.now() - 60 * 1000) // 1 minute in the past
      });

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawResetToken,
          password: updatedPassword
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_RESET_TOKEN');
    });

    it('should reject invalid or tampered reset token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'tampered-invalid-token-1234567890abcdef',
          password: updatedPassword
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_RESET_TOKEN');
    });

    it('should reject short password (< 6 chars)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawResetToken,
          password: '123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
