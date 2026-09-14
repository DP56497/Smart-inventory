const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');
const emailService = require('./email.service');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken
} = require('../utils/token');
const AppError = require('../utils/AppError');
const { ROLES } = require('../constants/roles');

const generateSlug = (name) => {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base || 'org'}-${suffix}`;
};

const sanitizeUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId ? user.organizationId.toString() : null,
  status: user.status,
  createdAt: user.createdAt
});

class AuthService {
  async registerOwner(data) {
    const {
      name,
      email,
      password,
      organizationName,
      phone,
      gstin,
      currency,
      timezone
    } = data;

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user email is already registered
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new AppError('An account with this email already exists', 409, 'EMAIL_EXISTS');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const slug = generateSlug(organizationName);

    // Create session for atomic creation if replica set is available
    const session = await mongoose.startSession();
    let userDoc;
    let orgDoc;

    try {
      await session.withTransaction(async () => {
        // Pre-allocate user ID to establish bi-directional reference
        const userId = new mongoose.Types.ObjectId();

        const [createdOrg] = await Organization.create(
          [
            {
              name: organizationName.trim(),
              slug,
              ownerId: userId,
              email: normalizedEmail,
              phone: phone || '',
              gstin: gstin || '',
              currency: currency || 'INR',
              timezone: timezone || 'Asia/Kolkata',
              status: 'ACTIVE'
            }
          ],
          { session }
        );

        const [createdUser] = await User.create(
          [
            {
              _id: userId,
              name: name.trim(),
              email: normalizedEmail,
              password: hashedPassword,
              organizationId: createdOrg._id,
              role: ROLES.OWNER,
              status: 'ACTIVE'
            }
          ],
          { session }
        );

        orgDoc = createdOrg;
        userDoc = createdUser;
      });
    } catch (err) {
      // Fallback for standalone MongoDB (e.g. standard local test or dev without replica set)
      if (
        err.message &&
        (err.message.includes('Transaction') ||
          err.message.includes('replica set') ||
          err.message.includes('standalone') ||
          err.message.includes('not supported'))
      ) {
        const userId = new mongoose.Types.ObjectId();
        orgDoc = await Organization.create({
          name: organizationName.trim(),
          slug,
          ownerId: userId,
          email: normalizedEmail,
          phone: phone || '',
          gstin: gstin || '',
          currency: currency || 'INR',
          timezone: timezone || 'Asia/Kolkata',
          status: 'ACTIVE'
        });

        userDoc = await User.create({
          _id: userId,
          name: name.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          organizationId: orgDoc._id,
          role: ROLES.OWNER,
          status: 'ACTIVE'
        });
      } else {
        throw err;
      }
    } finally {
      await session.endSession();
    }

    // Issue tokens containing tenant context
    const tokenPayload = {
      id: userDoc._id.toString(),
      organizationId: orgDoc._id.toString(),
      role: userDoc.role,
      email: userDoc.email
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ id: userDoc._id.toString() });

    // Store secure hash of refresh token
    userDoc.refreshToken = hashToken(refreshToken);
    await userDoc.save();

    return {
      user: sanitizeUser(userDoc),
      organization: orgDoc,
      accessToken,
      refreshToken
    };
  }

  async login(email, password) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError('User account is deactivated. Contact administrator.', 403, 'ACCOUNT_DEACTIVATED');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // Verify Organization state
    const organization = await Organization.findById(user.organizationId);
    if (!organization) {
      throw new AppError('Organization not found for this account', 404, 'ORGANIZATION_NOT_FOUND');
    }

    if (organization.status !== 'ACTIVE') {
      throw new AppError('Organization account is suspended. Contact support.', 403, 'TENANT_SUSPENDED');
    }

    const tokenPayload = {
      id: user._id.toString(),
      organizationId: organization._id.toString(),
      role: user.role,
      email: user.email
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken({ id: user._id.toString() });

    user.refreshToken = hashToken(refreshToken);
    await user.save();

    return {
      user: sanitizeUser(user),
      organization,
      accessToken,
      refreshToken
    };
  }

  async refreshAccessToken(rawRefreshToken) {
    let decoded;
    try {
      decoded = verifyRefreshToken(rawRefreshToken);
    } catch (err) {
      throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    const user = await User.findById(decoded.id);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('User not found or inactive', 401, 'INVALID_REFRESH_TOKEN');
    }

    // Verify refresh token match via hash
    const incomingHash = hashToken(rawRefreshToken);
    if (user.refreshToken !== incomingHash) {
      // Potential token reuse / leak: revoke stored token for safety
      user.refreshToken = null;
      await user.save();
      throw new AppError('Refresh token was revoked or already used', 401, 'REFRESH_TOKEN_REUSE');
    }

    const organization = await Organization.findById(user.organizationId);
    if (!organization || organization.status !== 'ACTIVE') {
      throw new AppError('Tenant is inactive or suspended', 403, 'TENANT_SUSPENDED');
    }

    // Token rotation: Issue fresh access token AND fresh refresh token
    const tokenPayload = {
      id: user._id.toString(),
      organizationId: organization._id.toString(),
      role: user.role,
      email: user.email
    };

    const nextAccessToken = generateAccessToken(tokenPayload);
    const nextRefreshToken = generateRefreshToken({ id: user._id.toString() });

    user.refreshToken = hashToken(nextRefreshToken);
    await user.save();

    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken
    };
  }

  async logout(userId) {
    if (userId) {
      await User.findByIdAndUpdate(userId, { refreshToken: null });
    }
    return { success: true };
  }

  async getCurrentUser(userId) {
    const user = await User.findById(userId).select('-password');
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const organization = await Organization.findById(user.organizationId);

    return {
      user: sanitizeUser(user),
      organization
    };
  }

  async forgotPassword(email) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Anti-enumeration defense (OWASP):
    // Always return a generic success message so attackers cannot discover registered emails
    if (!user) {
      return {
        message: 'If an account with that email exists, password reset instructions have been sent.'
      };
    }

    // Generate high-entropy 32-byte (64 hex char) random reset token
    const rawResetToken = crypto.randomBytes(32).toString('hex');

    // Hash the token before storing in MongoDB
    user.passwordResetToken = hashToken(rawResetToken);
    // 15-minute expiration
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?token=${rawResetToken}`;

    // Dispatch email (or fallback to console in dev/test)
    await emailService.sendPasswordResetEmail({
      to: user.email,
      resetUrl,
      userName: user.name
    });

    const responseData = {
      message: 'If an account with that email exists, password reset instructions have been sent.'
    };

    // In non-production mode, expose reset details for quick testing and automated tests
    if (process.env.NODE_ENV !== 'production') {
      responseData.devResetToken = rawResetToken;
      responseData.devResetUrl = resetUrl;
    }

    return responseData;
  }

  async resetPassword(token, newPassword) {
    if (!token) {
      throw new AppError('Password reset token is required', 400, 'INVALID_RESET_TOKEN');
    }

    // Hash incoming token with SHA-256 to match DB record
    const hashedToken = hashToken(token);

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() }
    });

    if (!user) {
      throw new AppError('Password reset link is invalid or has expired', 400, 'INVALID_RESET_TOKEN');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear reset token and expiration
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    // Revoke all existing sessions / refresh tokens
    user.refreshToken = null;

    await user.save();

    return {
      message: 'Password has been reset successfully. You can now log in with your new password.'
    };
  }
}

module.exports = new AuthService();
