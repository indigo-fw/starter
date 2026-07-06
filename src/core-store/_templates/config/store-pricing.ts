/**
 * Store pricing extensions — project-owned totals collectors.
 *
 * The store's checkout runs every registered collector in sort order
 * (built-ins: subtotal=0, auto-discount=95, coupon=100, shipping=200,
 * tax=300). Register your own here for loyalty points, gift cards, bundles —
 * anything that adjusts an order's total. Imported as a side-effect from
 * `config/deps/store-deps.ts`.
 */
import { registerTotalsCollector } from '@/core-store/lib/totals-pipeline';

// ─── Member discount ─────────────────────────────────────────────────────────
// Subscribers get a percentage off store orders. Config-driven: add
// `storeDiscountPercent` to a plan's `features` map in `config/plans.ts`
// (e.g. `storeDiscountPercent: 10`) and members on that plan see the discount
// at checkout and in the totals preview. Plans without the key — and guest
// checkouts — are unaffected. Stacks with coupon codes by design; remove the
// coupon check below if you want it exclusive instead.

registerTotalsCollector({
  code: 'member-discount',
  label: 'Member discount',
  sortOrder: 110, // after coupon codes (100), before shipping (200)
  async collect(ctx) {
    const orgId = ctx.extensions.orgId as string | undefined;
    if (!orgId) return; // guest checkout

    // Dynamic import so this file keeps working when core-subscriptions
    // is not installed — the collector simply never discounts
    let percent = 0;
    try {
      const { getPlanFeatures } = await import('@/core-subscriptions/lib/feature-gate');
      const features = await getPlanFeatures(orgId);
      percent = typeof features.storeDiscountPercent === 'number' ? features.storeDiscountPercent : 0;
    } catch {
      return;
    }
    if (percent <= 0 || percent > 100) return;

    const subtotal = ctx.adjustments
      .filter((a) => a.code === 'subtotal')
      .reduce((sum, a) => sum + a.amountCents, 0);
    const discount = Math.round((subtotal * percent) / 100);
    if (discount <= 0) return;

    ctx.adjustments.push({
      code: 'member-discount',
      label: `Member discount (${percent}%)`,
      amountCents: -discount,
      metadata: { percent, orgId },
    });
    ctx.runningTotalCents -= discount;
  },
});
