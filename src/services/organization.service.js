const Organization = require('../models/Organization');
const AppError = require('../utils/AppError');

class OrganizationService {
  async getProfile(organizationId) {
    const organization = await Organization.findById(organizationId).populate('ownerId', 'name email');
    if (!organization) {
      throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }
    return organization;
  }

  async updateProfile(organizationId, updateData) {
    const allowedFields = [
      'name',
      'email',
      'phone',
      'address',
      'gstin',
      'logo',
      'currency',
      'timezone'
    ];

    const sanitizedData = {};
    for (const key of allowedFields) {
      if (updateData[key] !== undefined) {
        sanitizedData[key] = updateData[key];
      }
    }

    const updatedOrg = await Organization.findByIdAndUpdate(
      organizationId,
      { $set: sanitizedData },
      { new: true, runValidators: true }
    );

    if (!updatedOrg) {
      throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    return updatedOrg;
  }

  async getSettings(organizationId) {
    const organization = await Organization.findById(organizationId).select(
      'taxSettings inventorySettings currency timezone'
    );
    if (!organization) {
      throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }
    return organization;
  }

  async updateSettings(organizationId, settingsData) {
    const updateObj = {};

    if (settingsData.taxSettings) {
      updateObj.taxSettings = settingsData.taxSettings;
    }
    if (settingsData.inventorySettings) {
      updateObj.inventorySettings = settingsData.inventorySettings;
    }

    const updatedOrg = await Organization.findByIdAndUpdate(
      organizationId,
      { $set: updateObj },
      { new: true, runValidators: true }
    ).select('taxSettings inventorySettings currency timezone');

    if (!updatedOrg) {
      throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    return updatedOrg;
  }
}

module.exports = new OrganizationService();
