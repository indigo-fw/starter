import { and, eq, sql, gte, lte, desc, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeOrders, storeOrderItems } from '@/core-store/schema/orders';
import { getStats } from '@/core/lib/infra/stats-cache';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoreStats {
  totalOrders: number;
  totalRevenueCents: number;
  averageOrderValueCents: number;
  ordersByStatus: Record<string, number>;
  revenueByDay: Array<{ date: string; revenueCents: number; orderCount: number }>;
  topProducts: Array<{ productName: string; productId: string | null; revenueCents: number; quantity: number }>;
}

export interface TaxReportRow {
  country: string;
  totalTaxCents: number;
  totalRevenueCents: number;
  orderCount: number;
  reverseChargeCents: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Statuses that count as successful (revenue-generating) orders */
const SUCCESSFUL_STATUSES = ['processing', 'shipped', 'delivered'] as const;

function buildDateConditions(from?: string, to?: string) {
  const conditions = [];
  if (from) conditions.push(gte(storeOrders.createdAt, new Date(from)));
  if (to) conditions.push(lte(storeOrders.createdAt, new Date(to)));
  return conditions;
}

// ---------------------------------------------------------------------------
// Store Stats
// ---------------------------------------------------------------------------

/**
 * Get aggregated store statistics with 5-minute TTL cache.
 * Covers: total orders, revenue, AOV, orders by status, revenue by day, top products.
 */
export async function getStoreStats(from?: string, to?: string): Promise<StoreStats> {
  const cacheKey = `store:stats:${from ?? ''}:${to ?? ''}`;

  return getStats(cacheKey, async () => {
    const dateConditions = buildDateConditions(from, to);

    // --- Total orders by status ---
    const statusCounts = await db
      .select({
        status: storeOrders.status,
        count: sql<number>`count(*)::int`,
      })
      .from(storeOrders)
      .where(dateConditions.length > 0 ? and(...dateConditions) : undefined)
      .groupBy(storeOrders.status);

    const ordersByStatus: Record<string, number> = {};
    let totalOrders = 0;
    for (const row of statusCounts) {
      ordersByStatus[row.status] = row.count;
      totalOrders += row.count;
    }

    // --- Total revenue + average order value (successful orders only) ---
    const [revenueRow] = await db
      .select({
        totalRevenueCents: sql<number>`COALESCE(sum(${storeOrders.totalCents}), 0)::int`,
        successfulCount: sql<number>`count(*)::int`,
      })
      .from(storeOrders)
      .where(
        and(
          inArray(storeOrders.status, [...SUCCESSFUL_STATUSES]),
          ...dateConditions,
        ),
      );

    const totalRevenueCents = revenueRow?.totalRevenueCents ?? 0;
    const successfulCount = revenueRow?.successfulCount ?? 0;
    const averageOrderValueCents =
      successfulCount > 0 ? Math.round(totalRevenueCents / successfulCount) : 0;

    // --- Revenue by day (last 30 days or date range) ---
    const dayFrom = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dayTo = to ?? new Date().toISOString();

    const revenueByDay = await db
      .select({
        date: sql<string>`to_char(${storeOrders.createdAt}, 'YYYY-MM-DD')`,
        revenueCents: sql<number>`COALESCE(sum(${storeOrders.totalCents}), 0)::int`,
        orderCount: sql<number>`count(*)::int`,
      })
      .from(storeOrders)
      .where(
        and(
          inArray(storeOrders.status, [...SUCCESSFUL_STATUSES]),
          gte(storeOrders.createdAt, new Date(dayFrom)),
          lte(storeOrders.createdAt, new Date(dayTo)),
        ),
      )
      .groupBy(sql`to_char(${storeOrders.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${storeOrders.createdAt}, 'YYYY-MM-DD')`);

    // --- Top 5 products by revenue ---
    const topProducts = await db
      .select({
        productName: storeOrderItems.productName,
        productId: storeOrderItems.productId,
        revenueCents: sql<number>`COALESCE(sum(${storeOrderItems.totalCents}), 0)::int`,
        quantity: sql<number>`COALESCE(sum(${storeOrderItems.quantity}), 0)::int`,
      })
      .from(storeOrderItems)
      .innerJoin(storeOrders, eq(storeOrderItems.orderId, storeOrders.id))
      .where(
        and(
          inArray(storeOrders.status, [...SUCCESSFUL_STATUSES]),
          ...dateConditions,
        ),
      )
      .groupBy(storeOrderItems.productName, storeOrderItems.productId)
      .orderBy(desc(sql`sum(${storeOrderItems.totalCents})`))
      .limit(5);

    return {
      totalOrders,
      totalRevenueCents,
      averageOrderValueCents,
      ordersByStatus,
      revenueByDay,
      topProducts,
    };
  }, 300);
}

// ---------------------------------------------------------------------------
// Tax Report
// ---------------------------------------------------------------------------

/**
 * Generate a tax report for a date range.
 * Parses order-level taxDetails JSONB to aggregate per-country tax collected.
 */
export async function getTaxReport(
  from: string,
  to: string,
  country?: string,
): Promise<TaxReportRow[]> {
  const conditions = [
    inArray(storeOrders.status, [...SUCCESSFUL_STATUSES]),
    gte(storeOrders.createdAt, new Date(from)),
    lte(storeOrders.createdAt, new Date(to)),
  ];

  const orders = await db
    .select({
      totalCents: storeOrders.totalCents,
      taxCents: storeOrders.taxCents,
      taxDetails: storeOrders.taxDetails,
      billingProfile: storeOrders.billingProfile,
    })
    .from(storeOrders)
    .where(and(...conditions))
    .limit(10_000);

  const countryMap = new Map<string, {
    totalTaxCents: number;
    totalRevenueCents: number;
    orderCount: number;
    reverseChargeCents: number;
  }>();

  for (const order of orders) {
    // Extract country from billing profile
    const profile = order.billingProfile as Record<string, unknown> | null;
    const orderCountry = (profile?.country as string) ?? 'UNKNOWN';

    if (country && orderCountry !== country) continue;

    const existing = countryMap.get(orderCountry) ?? {
      totalTaxCents: 0,
      totalRevenueCents: 0,
      orderCount: 0,
      reverseChargeCents: 0,
    };

    existing.totalRevenueCents += order.totalCents;
    existing.totalTaxCents += order.taxCents;
    existing.orderCount += 1;

    // Check for reverse charge in taxDetails
    const taxDetails = order.taxDetails as Record<string, unknown> | null;
    if (taxDetails?.reverseCharge === true) {
      existing.reverseChargeCents += order.taxCents;
    }

    countryMap.set(orderCountry, existing);
  }

  const rows: TaxReportRow[] = [];
  for (const [ctry, data] of countryMap) {
    rows.push({ country: ctry, ...data });
  }

  rows.sort((a, b) => b.totalTaxCents - a.totalTaxCents);
  return rows;
}
