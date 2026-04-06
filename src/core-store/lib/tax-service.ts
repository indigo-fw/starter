import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeTaxRates } from '@/core-store/schema/shipping-tax';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('store-tax');

export interface TaxCalculation {
  /** Tax amount in cents */
  taxCents: number;
  /** Tax rate as percentage */
  rate: number;
  /** Tax name (e.g. "VAT 21%") */
  name: string;
  /** Whether price already includes tax */
  priceIncludesTax: boolean;
  /** Reverse charge applies (B2B) */
  reverseCharge: boolean;
}

/**
 * Calculate tax for a given amount, country, and tax class.
 * Supports EU VAT (price includes tax) and US-style (price excludes tax).
 */
export async function calculateTax(
  amountCents: number,
  country: string,
  taxClass = 'standard',
  vatId?: string,
): Promise<TaxCalculation> {
  // Look up tax rate for country + class
  const [taxRate] = await db
    .select()
    .from(storeTaxRates)
    .where(
      and(
        eq(storeTaxRates.country, country.toUpperCase()),
        eq(storeTaxRates.taxClass, taxClass),
        eq(storeTaxRates.isActive, true),
      )
    )
    .limit(1);

  if (!taxRate) {
    return { taxCents: 0, rate: 0, name: 'No tax', priceIncludesTax: false, reverseCharge: false };
  }

  const rate = Number(taxRate.rate);

  // EU B2B reverse charge: valid VAT ID from another EU country = 0% tax
  if (taxRate.reverseCharge && vatId) {
    logger.debug('Reverse charge applied', { country, vatId });
    return { taxCents: 0, rate: 0, name: `${taxRate.name} (reverse charge)`, priceIncludesTax: taxRate.priceIncludesTax, reverseCharge: true };
  }

  let taxCents: number;
  if (taxRate.priceIncludesTax) {
    // EU style: price includes tax. Extract tax from amount.
    // amount = net + tax = net * (1 + rate/100)
    // tax = amount - amount / (1 + rate/100)
    taxCents = Math.round(amountCents - amountCents / (1 + rate / 100));
  } else {
    // US style: price excludes tax. Add tax on top.
    taxCents = Math.round(amountCents * rate / 100);
  }

  return {
    taxCents,
    rate,
    name: `${taxRate.name} ${rate}%`,
    priceIncludesTax: taxRate.priceIncludesTax,
    reverseCharge: false,
  };
}

/**
 * Calculate tax for multiple line items with potentially different tax classes.
 */
export async function calculateOrderTax(
  items: { amountCents: number; taxClass: string }[],
  country: string,
  vatId?: string,
): Promise<{ totalTaxCents: number; lineItemTax: TaxCalculation[] }> {
  const results = await Promise.all(
    items.map((item) => calculateTax(item.amountCents, country, item.taxClass, vatId))
  );

  return {
    totalTaxCents: results.reduce((sum, r) => sum + r.taxCents, 0),
    lineItemTax: results,
  };
}
