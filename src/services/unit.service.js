const Unit = require('../models/Unit');
const AppError = require('../utils/AppError');

const DEFAULT_UNITS = [
  { name: 'Pieces', code: 'PCS' },
  { name: 'Kilograms', code: 'KG' },
  { name: 'Grams', code: 'GM' },
  { name: 'Liters', code: 'LTR' },
  { name: 'Meters', code: 'MTR' },
  { name: 'Boxes', code: 'BOX' },
  { name: 'Packets', code: 'PKT' }
];

class UnitService {
  async getUnits(organizationId) {
    let units = await Unit.find({ organizationId }).sort({ name: 1 });
    // Seed default standard units if organization has no units defined yet
    if (units.length === 0) {
      const seedDocs = DEFAULT_UNITS.map((u) => ({
        ...u,
        organizationId,
        status: 'ACTIVE'
      }));
      await Unit.insertMany(seedDocs);
      units = await Unit.find({ organizationId }).sort({ name: 1 });
    }
    return units;
  }

  async createUnit(organizationId, data) {
    const code = data.code.trim().toUpperCase();
    const existing = await Unit.findOne({
      organizationId,
      code
    });

    if (existing) {
      throw new AppError('Unit code already exists in this organization', 409, 'UNIT_EXISTS');
    }

    const unit = new Unit({
      name: data.name.trim(),
      code,
      status: data.status || 'ACTIVE',
      organizationId
    });

    return unit.save();
  }

  async deleteUnit(organizationId, id) {
    const deleted = await Unit.findOneAndDelete({ _id: id, organizationId });
    if (!deleted) {
      throw new AppError('Unit not found', 404, 'UNIT_NOT_FOUND');
    }
    return deleted;
  }
}

module.exports = new UnitService();
