/**
 * Totals collector pipeline — pluggable order totals calculation.
 *
 * Modules register collectors at server init. The pipeline runs them in sort
 * order, accumulating adjustments. Built-in: subtotal (0), shipping (200), tax (300).
 * Gap at 100 for discounts/coupons added by external modules.
 *
 * Usage:
 *   registerTotalsCollector({ code: 'loyalty', label: 'Loyalty Points', sortOrder: 110, collect(ctx) { ... } });
 *   const result = await calculateTotalsPipeline({ cart, country, shippingRateId, vatId });
 */

import type { CartWithItems } from '@/core-store/lib/cart-service';
import type { TaxCalculation } from '@/core-store/lib/tax-service';
import { calculateOrderTax } from '@/core-store/lib/tax-service';
import type { ShippingOption } from '@/core-store/lib/shipping-service';
import { getShippingOptions } from '@/core-store/lib/shipping-service';
import { validateDiscount, type DiscountResult } from '@/core-store/lib/discount-service';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single adjustment produced by a collector. */
export interface TotalAdjustment {
  /** Unique collector code (e.g. 'subtotal', 'shipping', 'tax', 'coupon') */
  code: string;
  /** Human-readable label */
  label: string;
  /** Amount in cents (positive = charge, negative = discount) */
  amountCents: number;
  /** Optional metadata (tax breakdown, shipping details, coupon info, etc.) */
  metadata?: Record<string, unknown>;
}

/** Mutable context passed through the pipeline. */
export interface TotalsContext {
  // Input (set by runner)
  readonly cart: CartWithItems;
  readonly country: string;
  readonly shippingRateId?: string;
  readonly vatId?: string;

  // Running state (collectors read + modify)
  runningTotalCents: number;
  adjustments: TotalAdjustment[];

  // Typed sub-results (set by specific collectors)
  taxDetails?: { totalTaxCents: number; lineItemTax: TaxCalculation[] };
  shippingOption?: ShippingOption | null;
  discountResult?: DiscountResult | null;

  // Open extension bag for cross-collector data (e.g. coupon code, loyalty balance)
  extensions: Record<string, unknown>;
}

/** Final pipeline result. */
export interface TotalsResult {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  itemCount: number;
  adjustments: TotalAdjustment[];
  taxDetails?: { totalTaxCents: number; lineItemTax: TaxCalculation[] };
  shippingOption?: ShippingOption | null;
  discountResult?: DiscountResult | null;
}

/** Collector definition. */
export interface TotalsCollector {
  /** Unique code — also used as the TotalAdjustment.code */
  code: string;
  /** Display label */
  label: string;
  /** Sort order — lower runs first. Built-in: subtotal=0, shipping=200, tax=300 */
  sortOrder: number;
  /** The collector function — pushes to ctx.adjustments, modifies ctx.runningTotalCents */
  collect: (ctx: TotalsContext) => Promise<void>;
}

// ─── Registry ───────────────────────────────────────────────────────────────

const collectors: TotalsCollector[] = [];

/** Register a totals collector. Called during server init. */
export function registerTotalsCollector(collector: TotalsCollector): void {
  collectors.push(collector);
  collectors.sort((a, b) => a.sortOrder - b.sortOrder);
}

// ─── Pipeline runner ────────────────────────────────────────────────────────

function sumByCode(ctx: TotalsContext, code: string): number {
  return ctx.adjustments
    .filter((a) => a.code === code)
    .reduce((sum, a) => sum + a.amountCents, 0);
}

const KNOWN_CODES = new Set(['subtotal', 'shipping', 'tax']);

/** Run the full totals pipeline and return structured result. */
export async function calculateTotalsPipeline(params: {
  cart: CartWithItems;
  country: string;
  shippingRateId?: string;
  vatId?: string;
  /** Seed the extensions bag (e.g. { discountCode, userId }) */
  extensions?: Record<string, unknown>;
}): Promise<TotalsResult> {
  const ctx: TotalsContext = {
    cart: params.cart,
    country: params.country,
    shippingRateId: params.shippingRateId,
    vatId: params.vatId,
    runningTotalCents: 0,
    adjustments: [],
    extensions: { ...params.extensions },
  };

  for (const collector of collectors) {
    await collector.collect(ctx);
  }

  const subtotal = sumByCode(ctx, 'subtotal');
  const shipping = sumByCode(ctx, 'shipping');
  const tax = sumByCode(ctx, 'tax');

  // Discount = sum of all negative adjustments that aren't subtotal/shipping/tax
  const discount = ctx.adjustments
    .filter((a) => !KNOWN_CODES.has(a.code) && a.amountCents < 0)
    .reduce((sum, a) => sum + a.amountCents, 0);

  return {
    subtotalCents: subtotal,
    shippingCents: shipping,
    taxCents: tax,
    discountCents: Math.abs(discount),
    totalCents: Math.max(0, ctx.runningTotalCents),
    itemCount: params.cart.itemCount,
    adjustments: ctx.adjustments,
    taxDetails: ctx.taxDetails,
    shippingOption: ctx.shippingOption,
    discountResult: ctx.discountResult,
  };
}

// ─── Built-in collectors ────────────────────────────────────────────────────

registerTotalsCollector({
  code: 'subtotal',
  label: 'Subtotal',
  sortOrder: 0,
  async collect(ctx) {
    const amt = ctx.cart.subtotalCents;
    ctx.adjustments.push({ code: 'subtotal', label: 'Subtotal', amountCents: amt });
    ctx.runningTotalCents += amt;
  },
});

registerTotalsCollector({
  code: 'discount',
  label: 'Discount',
  sortOrder: 100,
  async collect(ctx) {
    const discountCode = ctx.extensions.discountCode as string | undefined;
    const userId = ctx.extensions.userId as string | undefined;
    if (!discountCode || !userId) return;

    const result = await validateDiscount({
      code: discountCode,
      subtotalCents: ctx.runningTotalCents,
      userId,
      currency: ctx.cart.currency,
    });

    ctx.discountResult = result;
    ctx.adjustments.push({
      code: 'discount',
      label: `Discount: ${result.code}`,
      amountCents: -result.discountCents,
      metadata: { discountId: result.discountId, type: result.type },
    });
    ctx.runningTotalCents -= result.discountCents;
  },
});

// Gap at 150+ for external module adjustments (loyalty points, gift cards, etc.)

registerTotalsCollector({
  code: 'shipping',
  label: 'Shipping',
  sortOrder: 200,
  async collect(ctx) {
    if (!ctx.shippingRateId) return;
    const options = await getShippingOptions(ctx.country, ctx.runningTotalCents);
    const selected = options.find((o) => o.rateId === ctx.shippingRateId);
    if (!selected) return;
    ctx.shippingOption = selected;
    ctx.adjustments.push({
      code: 'shipping',
      label: selected.name,
      amountCents: selected.rateCents,
      metadata: { zoneName: selected.zoneName, estimatedDays: selected.estimatedDays },
    });
    ctx.runningTotalCents += selected.rateCents;
  },
});

registerTotalsCollector({
  code: 'tax',
  label: 'Tax',
  sortOrder: 300,
  async collect(ctx) {
    const taxItems = ctx.cart.items.map((item) => ({
      amountCents: item.totalCents,
      taxClass: 'standard', // TODO: use product-level taxClass when available
    }));
    const result = await calculateOrderTax(taxItems, ctx.country, ctx.vatId);
    ctx.taxDetails = result;
    ctx.adjustments.push({ code: 'tax', label: 'Tax', amountCents: result.totalTaxCents });
    ctx.runningTotalCents += result.totalTaxCents;
  },
});
