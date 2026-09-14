const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Supplier = require('../models/Supplier');
const StockMovement = require('../models/StockMovement');

class ReportService {
  /**
   * Helper to resolve standard or custom date ranges into start and end UTC Date objects
   */
  resolveDateRange(filter = '30_DAYS', customStart = null, customEnd = null) {
    const now = new Date();
    let startDate;
    let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch ((filter || '30_DAYS').toUpperCase()) {
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
   * Executive Financial & P&L Statement Report
   */
  async getFinancialSummary(organizationId, query = {}) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    const { startDate, endDate } = this.resolveDateRange(
      query.filter || '30_DAYS',
      query.startDate,
      query.endDate
    );

    const [
      salesAgg,
      purchasesAgg,
      trendAgg,
      customerReceivablesAgg,
      supplierPayablesAgg,
      inventoryValuationAgg
    ] = await Promise.all([
      // 1. Sales & Revenue Aggregates
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
                      '$$item.quantity',
                      { $ifNull: ['$$item.purchasePrice', 0] }
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
            totalRevenue: { $sum: '$grandTotal' },
            netSubtotal: { $sum: '$subtotal' },
            totalTaxCollected: { $sum: '$totalTax' },
            totalDiscounts: { $sum: '$discountAmount' },
            totalCogs: { $sum: '$cogs' },
            salesCount: { $sum: 1 }
          }
        }
      ]),

      // 2. Purchases Aggregates
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
            totalPaidPurchases: { $sum: '$paidAmount' },
            purchasesCount: { $sum: 1 }
          }
        }
      ]),

      // 3. Daily Revenue vs Cost vs Profit Trend
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
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            grandTotal: 1,
            cogs: {
              $sum: {
                $map: {
                  input: '$items',
                  as: 'item',
                  in: {
                    $multiply: [
                      '$$item.quantity',
                      { $ifNull: ['$$item.purchasePrice', 0] }
                    ]
                  }
                }
              }
            }
          }
        },
        {
          $group: {
            _id: '$date',
            revenue: { $sum: '$grandTotal' },
            cost: { $sum: '$cogs' },
            salesCount: { $sum: 1 }
          }
        },
        {
          $project: {
            date: '$_id',
            revenue: { $round: ['$revenue', 2] },
            cost: { $round: ['$cost', 2] },
            grossProfit: { $round: [{ $subtract: ['$revenue', '$cost'] }, 2] },
            salesCount: 1
          }
        },
        { $sort: { date: 1 } }
      ]),

      // 4. Receivables from customers
      Customer.aggregate([
        { $match: { organizationId: orgId, creditBalance: { $gt: 0 } } },
        { $group: { _id: null, totalReceivables: { $sum: '$creditBalance' }, count: { $sum: 1 } } }
      ]),

      // 5. Payables to suppliers
      Supplier.aggregate([
        { $match: { organizationId: orgId, outstandingPayable: { $gt: 0 } } },
        { $group: { _id: null, totalPayables: { $sum: '$outstandingPayable' }, count: { $sum: 1 } } }
      ]),

      // 6. Current Inventory Valuation
      Product.aggregate([
        { $match: { organizationId: orgId, status: 'ACTIVE' } },
        {
          $group: {
            _id: null,
            totalStockCost: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } },
            totalStockRetail: { $sum: { $multiply: ['$currentStock', '$sellingPrice'] } },
            totalItems: { $sum: 1 }
          }
        }
      ])
    ]);

    const sales = salesAgg[0] || {
      totalRevenue: 0,
      netSubtotal: 0,
      totalTaxCollected: 0,
      totalDiscounts: 0,
      totalCogs: 0,
      salesCount: 0
    };

    const purchases = purchasesAgg[0] || {
      totalPurchases: 0,
      totalPaidPurchases: 0,
      purchasesCount: 0
    };

    const receivables = customerReceivablesAgg[0] || { totalReceivables: 0, count: 0 };
    const payables = supplierPayablesAgg[0] || { totalPayables: 0, count: 0 };
    const inventory = inventoryValuationAgg[0] || {
      totalStockCost: 0,
      totalStockRetail: 0,
      totalItems: 0
    };

    const grossProfit = Number((sales.totalRevenue - sales.totalCogs).toFixed(2));
    const profitMargin = sales.totalRevenue > 0
      ? Number(((grossProfit / sales.totalRevenue) * 100).toFixed(1))
      : 0;

    return {
      dateRange: { startDate, endDate, filter: query.filter || '30_DAYS' },
      overview: {
        revenue: Number((sales.totalRevenue || 0).toFixed(2)),
        cogs: Number((sales.totalCogs || 0).toFixed(2)),
        grossProfit,
        profitMargin,
        totalPurchases: Number((purchases.totalPurchases || 0).toFixed(2)),
        totalPurchasesPaid: Number((purchases.totalPaidPurchases || 0).toFixed(2)),
        taxCollected: Number((sales.totalTaxCollected || 0).toFixed(2)),
        discountsGiven: Number((sales.totalDiscounts || 0).toFixed(2)),
        salesCount: sales.salesCount || 0,
        purchasesCount: purchases.purchasesCount || 0
      },
      balanceSheetSnapshot: {
        outstandingReceivables: Number((receivables.totalReceivables || 0).toFixed(2)),
        receivablesCustomerCount: receivables.count || 0,
        outstandingPayables: Number((payables.totalPayables || 0).toFixed(2)),
        payablesSupplierCount: payables.count || 0,
        inventoryCostValue: Number((inventory.totalStockCost || 0).toFixed(2)),
        inventoryRetailValue: Number((inventory.totalStockRetail || 0).toFixed(2)),
        potentialInventoryProfit: Number(
          ((inventory.totalStockRetail || 0) - (inventory.totalStockCost || 0)).toFixed(2)
        )
      },
      trend: trendAgg
    };
  }

  /**
   * In-Depth Sales & Channel Analytics Report
   */
  async getSalesReport(organizationId, query = {}) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    const { startDate, endDate } = this.resolveDateRange(
      query.filter || '30_DAYS',
      query.startDate,
      query.endDate
    );

    const [trend, paymentMethods, cashiers, topProducts] = await Promise.all([
      // Sales timeline
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
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            totalSales: { $sum: '$grandTotal' },
            transactions: { $sum: 1 },
            avgTicket: { $avg: '$grandTotal' }
          }
        },
        {
          $project: {
            date: '$_id',
            totalSales: { $round: ['$totalSales', 2] },
            transactions: 1,
            avgTicket: { $round: ['$avgTicket', 2] }
          }
        },
        { $sort: { date: 1 } }
      ]),

      // Payment Method Breakdown
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
            amount: { $sum: '$grandTotal' },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            method: '$_id',
            amount: { $round: ['$amount', 2] },
            count: 1
          }
        },
        { $sort: { amount: -1 } }
      ]),

      // Cashier breakdown
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
            _id: '$cashier',
            totalSales: { $sum: '$grandTotal' },
            transactions: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'cashierUser'
          }
        },
        { $unwind: { path: '$cashierUser', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            cashierId: '$_id',
            name: { $ifNull: ['$cashierUser.name', 'Staff'] },
            email: { $ifNull: ['$cashierUser.email', ''] },
            totalSales: { $round: ['$totalSales', 2] },
            transactions: 1
          }
        },
        { $sort: { totalSales: -1 } }
      ]),

      // Top Selling Products
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
            quantitySold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.total' },
            totalCost: {
              $sum: {
                $multiply: [
                  '$items.quantity',
                  { $ifNull: ['$items.purchasePrice', 0] }
                ]
              }
            }
          }
        },
        {
          $project: {
            productId: '$_id',
            name: 1,
            SKU: 1,
            quantitySold: { $round: ['$quantitySold', 2] },
            totalRevenue: { $round: ['$totalRevenue', 2] },
            totalCost: { $round: ['$totalCost', 2] },
            profit: { $round: [{ $subtract: ['$totalRevenue', '$totalCost'] }, 2] },
            margin: {
              $cond: [
                { $gt: ['$totalRevenue', 0] },
                {
                  $round: [
                    {
                      $multiply: [
                        {
                          $divide: [
                            { $subtract: ['$totalRevenue', '$totalCost'] },
                            '$totalRevenue'
                          ]
                        },
                        100
                      ]
                    },
                    1
                  ]
                },
                0
              ]
            }
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 20 }
      ])
    ]);

    return {
      dateRange: { startDate, endDate, filter: query.filter || '30_DAYS' },
      trend,
      paymentMethods,
      cashiers,
      topProducts
    };
  }

  /**
   * Inventory Valuation, Stock Health & Movement Report
   */
  async getInventoryReport(organizationId) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());

    const [valuationAgg, categoriesAgg, movementsAgg] = await Promise.all([
      // Overall Stock Health and Valuation
      Product.aggregate([
        { $match: { organizationId: orgId, status: 'ACTIVE' } },
        {
          $group: {
            _id: null,
            totalItems: { $sum: 1 },
            totalStockQuantity: { $sum: '$currentStock' },
            costValuation: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } },
            retailValuation: { $sum: { $multiply: ['$currentStock', '$sellingPrice'] } },
            inStockCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$currentStock', 0] },
                      {
                        $or: [
                          { $lte: ['$reorderLevel', 0] },
                          { $gt: ['$currentStock', '$reorderLevel'] }
                        ]
                      }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            lowStockCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$currentStock', 0] },
                      { $gt: ['$reorderLevel', 0] },
                      { $lte: ['$currentStock', '$reorderLevel'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            outOfStockCount: {
              $sum: { $cond: [{ $lte: ['$currentStock', 0] }, 1, 0] }
            },
            overStockCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$maximumStock', 0] },
                      { $gt: ['$currentStock', '$maximumStock'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),

      // Category-wise Breakdown
      Product.aggregate([
        { $match: { organizationId: orgId, status: 'ACTIVE' } },
        {
          $group: {
            _id: '$categoryId',
            itemCount: { $sum: 1 },
            totalUnits: { $sum: '$currentStock' },
            costValue: { $sum: { $multiply: ['$currentStock', '$purchasePrice'] } },
            retailValue: { $sum: { $multiply: ['$currentStock', '$sellingPrice'] } }
          }
        },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category'
          }
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            categoryId: '$_id',
            name: { $ifNull: ['$category.name', 'Uncategorized'] },
            itemCount: 1,
            totalUnits: 1,
            costValue: { $round: ['$costValue', 2] },
            retailValue: { $round: ['$retailValue', 2] }
          }
        },
        { $sort: { costValue: -1 } }
      ]),

      // Recent Stock Movements (last 30 days)
      StockMovement.aggregate([
        {
          $match: {
            organizationId: orgId,
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: '$type',
            totalQuantity: { $sum: '$quantity' },
            movementCount: { $sum: 1 }
          }
        },
        {
          $project: {
            type: '$_id',
            totalQuantity: { $round: ['$totalQuantity', 2] },
            movementCount: 1
          }
        },
        { $sort: { totalQuantity: -1 } }
      ])
    ]);

    const val = valuationAgg[0] || {
      totalItems: 0,
      totalStockQuantity: 0,
      costValuation: 0,
      retailValuation: 0,
      inStockCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      overStockCount: 0
    };

    const costVal = Number((val.costValuation || 0).toFixed(2));
    const retailVal = Number((val.retailValuation || 0).toFixed(2));
    const potentialMargin = Number((retailVal - costVal).toFixed(2));

    return {
      summary: {
        totalItems: val.totalItems,
        totalStockQuantity: val.totalStockQuantity,
        costValuation: costVal,
        retailValuation: retailVal,
        potentialMargin,
        inStockCount: val.inStockCount,
        lowStockCount: val.lowStockCount,
        outOfStockCount: val.outOfStockCount,
        overStockCount: val.overStockCount
      },
      categories: categoriesAgg,
      movements: movementsAgg
    };
  }

  /**
   * Purchases & Supplier Spending Report
   */
  async getPurchasesReport(organizationId, query = {}) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    const { startDate, endDate } = this.resolveDateRange(
      query.filter || '30_DAYS',
      query.startDate,
      query.endDate
    );

    const [trend, suppliers, statusBreakdown] = await Promise.all([
      // Purchases trend
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
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            totalPurchases: { $sum: '$grandTotal' },
            ordersCount: { $sum: 1 }
          }
        },
        {
          $project: {
            date: '$_id',
            totalPurchases: { $round: ['$totalPurchases', 2] },
            ordersCount: 1
          }
        },
        { $sort: { date: 1 } }
      ]),

      // Spend by Supplier
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
            _id: '$supplierId',
            totalSpend: { $sum: '$grandTotal' },
            totalPaid: { $sum: '$paidAmount' },
            ordersCount: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'suppliers',
            localField: '_id',
            foreignField: '_id',
            as: 'supplier'
          }
        },
        { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            supplierId: '$_id',
            name: { $ifNull: ['$supplier.name', 'Direct / One-off Vendor'] },
            companyName: { $ifNull: ['$supplier.companyName', ''] },
            totalSpend: { $round: ['$totalSpend', 2] },
            totalPaid: { $round: ['$totalPaid', 2] },
            outstanding: {
              $round: [{ $subtract: ['$totalSpend', '$totalPaid'] }, 2]
            },
            ordersCount: 1
          }
        },
        { $sort: { totalSpend: -1 } }
      ]),

      // Breakdown by status & payment status
      Purchase.aggregate([
        {
          $match: {
            organizationId: orgId,
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            amount: { $sum: '$grandTotal' }
          }
        },
        {
          $project: {
            status: '$_id',
            count: 1,
            amount: { $round: ['$amount', 2] }
          }
        }
      ])
    ]);

    return {
      dateRange: { startDate, endDate, filter: query.filter || '30_DAYS' },
      trend,
      suppliers,
      statusBreakdown
    };
  }

  /**
   * Customer Credit & Receivables Report
   */
  async getCustomerReport(organizationId, query = {}) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    const { startDate, endDate } = this.resolveDateRange(
      query.filter || '30_DAYS',
      query.startDate,
      query.endDate
    );

    const [topCustomers, creditRiskCustomers, overallStats] = await Promise.all([
      // Top spending customers in period
      Sale.aggregate([
        {
          $match: {
            organizationId: orgId,
            status: 'COMPLETED',
            'customer.customerId': { $ne: null },
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$customer.customerId',
            name: { $first: '$customer.name' },
            phone: { $first: '$customer.phone' },
            totalSpent: { $sum: '$grandTotal' },
            ordersCount: { $sum: 1 }
          }
        },
        {
          $project: {
            customerId: '$_id',
            name: 1,
            phone: 1,
            totalSpent: { $round: ['$totalSpent', 2] },
            ordersCount: 1
          }
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 15 }
      ]),

      // Customers with outstanding credit
      Customer.find({
        organizationId: orgId,
        creditBalance: { $gt: 0 }
      })
        .select('name phone email creditBalance creditLimit')
        .sort({ creditBalance: -1 })
        .limit(20)
        .lean(),

      // Customer count and total receivable summary
      Customer.aggregate([
        { $match: { organizationId: orgId } },
        {
          $group: {
            _id: null,
            totalCustomers: { $sum: 1 },
            totalCreditOutstanding: { $sum: '$creditBalance' }
          }
        }
      ])
    ]);

    const stats = overallStats[0] || { totalCustomers: 0, totalCreditOutstanding: 0 };

    return {
      summary: {
        totalCustomers: stats.totalCustomers,
        totalCreditOutstanding: Number((stats.totalCreditOutstanding || 0).toFixed(2))
      },
      topCustomers,
      creditRiskCustomers
    };
  }
}

module.exports = new ReportService();
