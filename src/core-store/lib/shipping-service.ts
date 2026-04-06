import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeShippingZones, storeShippingRates } from '@/core-store/schema/shipping-tax';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('store-shipping');

export interface ShippingOption {
  rateId: string;
  zoneName: string;
  name: string;
  rateCents: number;
  estimatedDays: string | null;
}

/**
 * Get available shipping options for a country + cart.
 */
export async function getShippingOptions(
  country: string,
  orderTotalCents: number,
  totalWeightGrams?: number,
): Promise<ShippingOption[]> {
  // Find the zone for this country
  const zones = await db
    .select()
    .from(storeShippingZones)
    .limit(100);

  const matchingZone = zones.find((z) => {
    const countries = z.countries as string[];
    return countries.includes(country.toUpperCase());
  }) ?? zones.find((z) => z.isDefault);

  if (!matchingZone) {
    logger.debug('No shipping zone for country', { country });
    return [];
  }

  // Get active rates for this zone
  const rates = await db
    .select()
    .from(storeShippingRates)
    .where(
      and(
        eq(storeShippingRates.zoneId, matchingZone.id),
        eq(storeShippingRates.isActive, true),
      )
    )
    .orderBy(storeShippingRates.sortOrder)
    .limit(20);

  return rates
    .filter((rate) => {
      // Weight filter
      if (totalWeightGrams !== undefined) {
        if (rate.minWeightGrams && totalWeightGrams < rate.minWeightGrams) return false;
        if (rate.maxWeightGrams && totalWeightGrams > rate.maxWeightGrams) return false;
      }
      return true;
    })
    .map((rate) => {
      // Free shipping threshold
      const isFree = rate.freeAboveCents && orderTotalCents >= rate.freeAboveCents;

      return {
        rateId: rate.id,
        zoneName: matchingZone.name,
        name: rate.name,
        rateCents: isFree ? 0 : rate.rateCents,
        estimatedDays: rate.estimatedDays,
      };
    });
}
