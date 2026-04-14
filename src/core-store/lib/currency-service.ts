import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeExchangeRates } from '@/core-store/schema/currency';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-currency');

/** Convert an amount from one currency to another. Returns null if rate not found. */
export async function convertCurrency(
  amountCents: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  if (fromCurrency === toCurrency) return amountCents;

  const [rate] = await db
    .select({ rate: storeExchangeRates.rate })
    .from(storeExchangeRates)
    .where(and(
      eq(storeExchangeRates.baseCurrency, fromCurrency.toUpperCase()),
      eq(storeExchangeRates.targetCurrency, toCurrency.toUpperCase()),
    ))
    .limit(1);

  if (!rate) {
    // Try reverse rate
    const [reverseRate] = await db
      .select({ rate: storeExchangeRates.rate })
      .from(storeExchangeRates)
      .where(and(
        eq(storeExchangeRates.baseCurrency, toCurrency.toUpperCase()),
        eq(storeExchangeRates.targetCurrency, fromCurrency.toUpperCase()),
      ))
      .limit(1);

    if (!reverseRate) {
      logger.warn('Exchange rate not found', { fromCurrency, toCurrency });
      return null;
    }

    return Math.round(amountCents / Number(reverseRate.rate));
  }

  return Math.round(amountCents * Number(rate.rate));
}

/** Get all available exchange rates from a base currency. */
export async function getExchangeRates(baseCurrency: string): Promise<Array<{ currency: string; rate: number }>> {
  const rates = await db
    .select({
      currency: storeExchangeRates.targetCurrency,
      rate: storeExchangeRates.rate,
    })
    .from(storeExchangeRates)
    .where(eq(storeExchangeRates.baseCurrency, baseCurrency.toUpperCase()))
    .limit(50);

  return rates.map((r) => ({ currency: r.currency, rate: Number(r.rate) }));
}
