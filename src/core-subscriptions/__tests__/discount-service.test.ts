import { describe, it, expect } from 'vitest';

// Only test the pure function — DB-dependent tests are covered by billing.test.ts
// (bun's test runner has cross-file mock leakage that makes direct DB mock tests unreliable)

import { calculateFinalPrice } from '@/core-subscriptions/lib/discount-service';
import { DiscountType } from '@/core-payments/types/payment';

describe('discount-service', () => {
  describe('calculateFinalPrice', () => {
    describe('PERCENTAGE discount', () => {
      it('applies a percentage discount correctly', () => {
        expect(calculateFinalPrice(10000, { type: DiscountType.PERCENTAGE, value: 20 })).toBe(8000);
      });
      it('applies 50% discount', () => {
        expect(calculateFinalPrice(9900, { type: DiscountType.PERCENTAGE, value: 50 })).toBe(4950);
      });
      it('applies 100% discount (free)', () => {
        expect(calculateFinalPrice(4900, { type: DiscountType.PERCENTAGE, value: 100 })).toBe(0);
      });
      it('applies 0% discount (no change)', () => {
        expect(calculateFinalPrice(4900, { type: DiscountType.PERCENTAGE, value: 0 })).toBe(4900);
      });
      it('rounds to nearest cent', () => {
        expect(calculateFinalPrice(1000, { type: DiscountType.PERCENTAGE, value: 33 })).toBe(670);
      });
      it('defaults to 0% when value is undefined', () => {
        expect(calculateFinalPrice(5000, { type: DiscountType.PERCENTAGE })).toBe(5000);
      });
      it('handles zero price input', () => {
        expect(calculateFinalPrice(0, { type: DiscountType.PERCENTAGE, value: 50 })).toBe(0);
      });
    });

    describe('FIXED_PRICE discount', () => {
      it('returns the fixed price value', () => {
        expect(calculateFinalPrice(4900, { type: DiscountType.FIXED_PRICE, value: 2500 })).toBe(2500);
      });
      it('returns 0 when fixed price is 0', () => {
        expect(calculateFinalPrice(4900, { type: DiscountType.FIXED_PRICE, value: 0 })).toBe(0);
      });
      it('falls back to original price when value is undefined', () => {
        expect(calculateFinalPrice(4900, { type: DiscountType.FIXED_PRICE })).toBe(4900);
      });
    });

    describe('TRIAL discount', () => {
      it('returns the trial price in cents', () => {
        expect(calculateFinalPrice(4900, { type: DiscountType.TRIAL, trialPriceCents: 100 })).toBe(100);
      });
      it('returns 0 when trialPriceCents is 0', () => {
        expect(calculateFinalPrice(4900, { type: DiscountType.TRIAL, trialPriceCents: 0 })).toBe(0);
      });
      it('defaults to 0 when trialPriceCents is undefined', () => {
        expect(calculateFinalPrice(4900, { type: DiscountType.TRIAL })).toBe(0);
      });
    });

    describe('FREE_TRIAL discount', () => {
      it('always returns 0', () => {
        expect(calculateFinalPrice(4900, { type: DiscountType.FREE_TRIAL })).toBe(0);
        expect(calculateFinalPrice(0, { type: DiscountType.FREE_TRIAL })).toBe(0);
        expect(calculateFinalPrice(99999, { type: DiscountType.FREE_TRIAL })).toBe(0);
      });
      it('ignores value and trialPriceCents', () => {
        expect(calculateFinalPrice(4900, { type: DiscountType.FREE_TRIAL, value: 50, trialPriceCents: 500 })).toBe(0);
      });
    });

    describe('unknown type', () => {
      it('returns original price', () => {
        expect(calculateFinalPrice(4900, { type: 'unknown' as DiscountType })).toBe(4900);
      });
    });
  });
});
