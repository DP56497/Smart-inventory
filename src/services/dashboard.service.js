const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const Purchase = require('../models/Purchase');
const StockMovement = require('../models/StockMovement');
const { ROLES } = require('../constants/roles');

class DashboardService {
  /**
   * Resolves filter presets into precise UTC Date objects
   */
  resolveDateRange(filter = '30_DAYS', customStart = null, customEnd = null) {
    const now = new Date();
    let startDate;
    let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (filter.toUpperCase()) {
      case 'TODAY': {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        break;
      }
      case 'YESTERDAY': {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        startDate = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
        endDate = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
        break;
      }
      case '7_DAYS': {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
        break;
      }
      case '30_DAYS': {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
        break;
      }
      case 'THIS_MONTH': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      }
      case 'THIS_YEAR': {
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
      }
      case 'CUSTOM': {
        if (customStart) {
          startDate = new Date(customStart);
          startDate.setHours(0, 0, 0, 0);
        } else {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
        }
        if (customEnd) {
          endDate = new Date(customEnd);
          endDate.setHours(23, 59, 59, 999);
        }
        break;
      }
      default: {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      }
    }

    return { startDate, endDate };
  }

  /**
   * Main Dashboard Analytics Aggregation Pipeline
   */
  async getDashboardData(organizationId, query = {}, userRole = ROLES.OWNER) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    const { startDate, endDate } = this.resolveDateRange(
      query.filter || '30_DAYS',
      query.startDate,
      query.endDate
    );

    // Today's dedicated time bounds
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Execute server-side MongoDB aggregation pipelines concurrently
    const [
      todaySalesAgg,
      rangeSalesAgg,
      todayPurchasesAgg,
      rangePurchasesAgg,
      productInventoryAgg,
      customerCount,
      supplierCount,
      pendingSalesAgg,
      pendingCustomerCreditAgg,
      salesTrendAgg,
      purchaseTrendAgg,
      topProductsAgg,
      paymentMethodsAgg,
      lowStockProducts
    ] = await Promise.all([
      // 1. Today's Sales Aggregation
      Sale.aggregate([
        {
          $match: {
            organizationId: orgId,
            status: 'COMPLETED',
            createdAt: { $gte: todayStart, $lte: todayEnd }
          }
        },
        {
          $project: {
            grandTotal: 1,
            subtotal: 1,
            totalTax: 1,
            discountAmount: 1,
            cogs: {
              $sum: {
                $map: {
                  input: '$items',
                  as: 'item',
                  in: {
                    $multiply: [
                      { $ifNull: ['$$item.purchasePrice', 0] },
                      '$$item.quantity'
                    ]
                  }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$grandTotal' },
            subtotal: { $sum: '$subtotal' },
            totalTax: { $sum: '$totalTax' },
            totalCogs: { $sum: '$cogs' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 2. Filtered Range Sales Aggregation
      Sale.aggregate([
        {
          $match: {
            organizationId: orgId,
            status: 'COMPLETED',
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $project: {
            grandTotal: 1,
            subtotal: 1,
            totalTax: 1,
            discountAmount: 1,
            cogs: {
              $sum: {
                $map: {
                  input: '$items',
                  as: 'item',
                  in: {
                    $multiply: [
                      { $ifNull: ['$$item.purchasePrice', 0] },
                      '$$item.quantity'
                    ]
                  }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$grandTotal' },
            subtotal: { $sum: '$subtotal' },
            totalTax: { $sum: '$totalTax' },
            totalCogs: { $sum: '$cogs' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 3. Today's Purchases Aggregation
      Purchase.aggregate([
        {
          $match: {
            organizationId: orgId,
            status: { $ne: 'CANCELLED' },
            createdAt: { $gte: todayStart, $lte: todayEnd }
          }
        },
        {
          $group: {
            _id: null,
            totalPurchases: { $sum: '$grandTotal' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 4. Range Purchases Aggregation
      Purchase.aggregate([
        {
          $match: {
            organizationId: orgId,
            status: { $ne: 'CANCELLED' },
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            totalPurchases: { $sum: '$grandTotal' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 5. Product & Inventory Valuations & Depletion Aggregation
      Product.aggregate([
        {
          $match: {
            organizationId: orgId,
            status: { $ne: 'ARCHIVED' }
          }
        },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            totalStockUnits: { $sum: '$currentStock' },
            totalStockValuePurchase: {
              $sum: { $multiply: ['$currentStock', { $ifNull: ['$purchasePrice', 0] }] }
            },
            totalStockValueSelling: {
              $sum: { $multiply: ['$currentStock', { $ifNull: ['$sellingPrice', 0] }] }
            },
            lowStockCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$currentStock', 0] },
                      { $lte: ['$currentStock', '$reorderLevel'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            outOfStockCount: {
              $sum: {
                $cond: [{ $lte: ['$currentStock', 0] }, 1, 0]
              }
            }
          }
        }
      ]),

      // 6. Customers count
      Customer.countDocuments({ organizationId: orgId }),

      // 7. Suppliers count
      Supplier.countDocuments({ organizationId: orgId }),

      // 8. Pending Sales
      Sale.aggregate([
        {
          $match: {
            organizationId: orgId,
            paymentStatus: 'PENDING',
            status: 'COMPLETED'
          }
        },
        {
          $group: {
            _id: null,
            totalPending: { $sum: '$grandTotal' },
            count: { $sum: 1 }
          }
        }
      ]),

      // 9. Customer Credit Ledger Balance
      Customer.aggregate([
        {
          $match: { organizationId: orgId }
        },
        {
          $group: {
            _id: null,
            totalCredit: { $sum: '$creditBalance' }
          }
        }
      ]),

      // 10. Sales & Profit Trend Aggregation
      this.aggregateSalesTrend(orgId, startDate, endDate, query.filter),

      // 11. Purchase Trend Aggregation
      this.aggregatePurchaseTrend(orgId, startDate, endDate, query.filter),

      // 12. Top Selling Products
      Sale.aggregate([
        {
          $match: {
            organizationId: orgId,
            status: 'COMPLETED',
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            SKU: { $first: '$items.SKU' },
            totalQuantity: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.total' }
          }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 5 }
      ]),

      // 13. Payment Methods Breakdown
      Sale.aggregate([
        {
          $match: {
            organizationId: orgId,
            status: 'COMPLETED',
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 },
            totalAmount: { $sum: '$grandTotal' }
          }
        }
      ]),

      // 14. Priority Low Stock Products
      Product.find({
        organizationId: orgId,
        status: 'ACTIVE',
        $expr: { $lte: ['$currentStock', '$reorderLevel'] }
      })
        .select('name SKU currentStock reorderLevel minimumStock sellingPrice')
        .sort({ currentStock: 1 })
        .limit(8)
        .lean()
    ]);

    // Parse Results
    const todaySales = todaySalesAgg[0] || { totalSales: 0, subtotal: 0, totalTax: 0, totalCogs: 0, count: 0 };
    const rangeSales = rangeSalesAgg[0] || { totalSales: 0, subtotal: 0, totalTax: 0, totalCogs: 0, count: 0 };

    const todayPurchases = todayPurchasesAgg[0]?.totalPurchases || 0;
    const rangePurchases = rangePurchasesAgg[0]?.totalPurchases || 0;

    // Gross Profit = Revenue (Net of Tax) minus Cost of Goods Sold
    const todayProfit = Math.max(0, todaySales.subtotal - todaySales.totalCogs);
    const rangeProfit = Math.max(0, rangeSales.subtotal - rangeSales.totalCogs);

    const inventoryStats = productInventoryAgg[0] || {
      totalProducts: 0,
      totalStockUnits: 0,
      totalStockValuePurchase: 0,
      totalStockValueSelling: 0,
      lowStockCount: 0,
      outOfStockCount: 0
    };

    const pendingSaleAmount = pendingSalesAgg[0]?.totalPending || 0;
    const customerCreditAmount = pendingCustomerCreditAgg[0]?.totalCredit || 0;
    const pendingPayments = Math.max(pendingSaleAmount, customerCreditAmount);

    // Merge Sales and Purchase trends into unified chart timeline
    const mergedTrend = this.mergeTrends(salesTrendAgg, purchaseTrendAgg);

    // Format payment methods with percentage
    const totalPaymentAmount = paymentMethodsAgg.reduce((acc, pm) => acc + pm.totalAmount, 0);
    const formattedPaymentMethods = paymentMethodsAgg.map((pm) => ({
      method: pm._id,
      count: pm.count,
      totalAmount: Math.round(pm.totalAmount * 100) / 100,
      percentage: totalPaymentAmount > 0 ? Math.round((pm.totalAmount / totalPaymentAmount) * 100) : 0
    }));

    // Construct response respecting role permissions
    const isCashier = userRole === ROLES.CASHIER;

    return {
      dateRange: {
        filter: query.filter || '30_DAYS',
        startDate,
        endDate
      },
      kpi: {
        todaySales: Math.round(todaySales.totalSales * 100) / 100,
        todaySalesCount: todaySales.count,
        rangeSales: Math.round(rangeSales.totalSales * 100) / 100,
        rangeSalesCount: rangeSales.count,

        todayPurchases: isCashier ? 0 : Math.round(todayPurchases * 100) / 100,
        rangePurchases: isCashier ? 0 : Math.round(rangePurchases * 100) / 100,

        todayProfit: isCashier ? 0 : Math.round(todayProfit * 100) / 100,
        rangeProfit: isCashier ? 0 : Math.round(rangeProfit * 100) / 100,

        totalProducts: inventoryStats.totalProducts,
        totalStockUnits: inventoryStats.totalStockUnits,
        totalStockValuePurchase: isCashier ? 0 : Math.round(inventoryStats.totalStockValuePurchase * 100) / 100,
        totalStockValueSelling: Math.round(inventoryStats.totalStockValueSelling * 100) / 100,

        lowStock: inventoryStats.lowStockCount,
        outOfStock: inventoryStats.outOfStockCount,

        customers: customerCount,
        suppliers: isCashier ? 0 : supplierCount,

        pendingPayments: Math.round(pendingPayments * 100) / 100
      },
      charts: {
        trends: isCashier
          ? mergedTrend.map((t) => ({ date: t.date, sales: t.sales, count: t.count }))
          : mergedTrend,
        topSellingProducts: topProductsAgg.map((p) => ({
          productId: p._id,
          name: p.name,
          SKU: p.SKU,
          totalQuantity: p.totalQuantity,
          totalRevenue: Math.round(p.totalRevenue * 100) / 100
        })),
        paymentMethods: formattedPaymentMethods,
        lowStockProducts
      }
    };
  }

  /**
   * Helper to aggregate time-bucketed sales and profit
   */
  async aggregateSalesTrend(orgId, startDate, endDate, filter) {
    const isHourly = ['TODAY', 'YESTERDAY'].includes((filter || '').toUpperCase());
    const isMonthly = (filter || '').toUpperCase() === 'THIS_YEAR';

    const dateFormat = isHourly ? '%Y-%m-%d %H:00' : isMonthly ? '%Y-%m' : '%Y-%m-%d';

    return await Sale.aggregate([
      {
        $match: {
          organizationId: orgId,
          status: 'COMPLETED',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $project: {
          createdAt: 1,
          grandTotal: 1,
          subtotal: 1,
          cogs: {
            $sum: {
              $map: {
                input: '$items',
                as: 'item',
                in: {
                  $multiply: [
                    { $ifNull: ['$$item.purchasePrice', 0] },
                    '$$item.quantity'
                  ]
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          sales: { $sum: '$grandTotal' },
          subtotal: { $sum: '$subtotal' },
          cogs: { $sum: '$cogs' },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          date: '$_id',
          sales: { $round: ['$sales', 2] },
          profit: {
            $round: [{ $max: [0, { $subtract: ['$subtotal', '$cogs'] }] }, 2]
          },
          count: '$count',
          _id: 0
        }
      },
      { $sort: { date: 1 } }
    ]);
  }

  /**
   * Helper to aggregate time-bucketed purchases
   */
  async aggregatePurchaseTrend(orgId, startDate, endDate, filter) {
    const isHourly = ['TODAY', 'YESTERDAY'].includes((filter || '').toUpperCase());
    const isMonthly = (filter || '').toUpperCase() === 'THIS_YEAR';

    const dateFormat = isHourly ? '%Y-%m-%d %H:00' : isMonthly ? '%Y-%m' : '%Y-%m-%d';

    return await Purchase.aggregate([
      {
        $match: {
          organizationId: orgId,
          status: { $ne: 'CANCELLED' },
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          purchases: { $sum: '$grandTotal' }
        }
      },
      {
        $project: {
          date: '$_id',
          purchases: { $round: ['$purchases', 2] },
          _id: 0
        }
      },
      { $sort: { date: 1 } }
    ]);
  }

  /**
   * Merges sales and purchase arrays by date key
   */
  mergeTrends(salesTrend, purchaseTrend) {
    const dateMap = new Map();

    for (const item of salesTrend) {
      dateMap.set(item.date, {
        date: item.date,
        sales: item.sales || 0,
        profit: item.profit || 0,
        purchases: 0,
        count: item.count || 0
      });
    }

    for (const item of purchaseTrend) {
      if (dateMap.has(item.date)) {
        dateMap.get(item.date).purchases = item.purchases || 0;
      } else {
        dateMap.set(item.date, {
          date: item.date,
          sales: 0,
          profit: 0,
          purchases: item.purchases || 0,
          count: 0
        });
      }
    }

    const sortedArray = Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return sortedArray;
  }
}

module.exports = new DashboardService();
