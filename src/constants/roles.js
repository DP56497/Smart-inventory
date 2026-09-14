const ROLES = Object.freeze({
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  STOCK_MANAGER: 'STOCK_MANAGER'
});

const ALL_ROLES = Object.values(ROLES);

module.exports = {
  ROLES,
  ALL_ROLES
};
