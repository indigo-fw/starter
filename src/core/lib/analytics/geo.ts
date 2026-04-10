import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('geo');

export interface GeoData {
  country?: string;  // ISO 3166-1 alpha-2 (e.g., 'US', 'DE')
  state?: string;    // Region/state name (e.g., 'California', 'Bavaria')
  timezone?: string; // IANA timezone (e.g., 'America/Los_Angeles')
  currency?: string; // ISO 4217 currency code (e.g., 'USD', 'EUR')
}

/**
 * Extract geo data from request headers.
 * Priority: Cloudflare headers (instant) → ip-api.com fallback (2s timeout).
 */
export async function detectGeo(headers: Headers, ip?: string): Promise<GeoData> {
  // Try Cloudflare headers first (free, instant, no API call)
  const cfCountry = headers.get('cf-ipcountry');
  const cfRegion = headers.get('cf-region-code'); // Cloudflare Enterprise only
  const cfTimezone = headers.get('cf-timezone');   // Cloudflare Enterprise only

  if (cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1') {
    return {
      country: cfCountry.toUpperCase(),
      state: cfRegion ?? undefined,
      timezone: cfTimezone ?? undefined,
      currency: countryCurrency(cfCountry.toUpperCase()),
    };
  }

  // Fallback: ip-api.com (free for non-commercial, 45 req/min)
  if (ip && ip !== '0.0.0.0' && ip !== '127.0.0.1') {
    return fetchGeoFromIpApi(ip);
  }

  return {};
}

/**
 * Lookup geo data from ip-api.com.
 * Free tier: 45 requests/minute, HTTP only (no HTTPS on free).
 * Returns empty object on failure (fail-open).
 */
async function fetchGeoFromIpApi(ip: string): Promise<GeoData> {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,timezone,currency`,
      { signal: AbortSignal.timeout(2000) }
    );

    if (!res.ok) return {};

    const data = await res.json() as {
      status: string;
      countryCode?: string;
      regionName?: string;
      timezone?: string;
      currency?: string;
    };

    if (data.status !== 'success') return {};

    return {
      country: data.countryCode,
      state: data.regionName ?? undefined,
      timezone: data.timezone ?? undefined,
      currency: data.currency ?? undefined,
    };
  } catch (err) {
    logger.warn('ip-api.com lookup failed', { ip, error: String(err) });
    return {};
  }
}

/** Map country code to likely currency (common cases) */
function countryCurrency(countryCode: string): string | undefined {
  const map: Record<string, string> = {
    US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', JP: 'JPY',
    CH: 'CHF', CN: 'CNY', IN: 'INR', BR: 'BRL', MX: 'MXN',
    KR: 'KRW', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
    CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', HR: 'EUR',
    // EU countries → EUR
    DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR',
    BE: 'EUR', AT: 'EUR', IE: 'EUR', PT: 'EUR', FI: 'EUR',
    GR: 'EUR', SK: 'EUR', SI: 'EUR', LT: 'EUR', LV: 'EUR',
    EE: 'EUR', LU: 'EUR', MT: 'EUR', CY: 'EUR',
    // More
    RU: 'RUB', UA: 'UAH', TR: 'TRY', ZA: 'ZAR', NZ: 'NZD',
    SG: 'SGD', HK: 'HKD', TW: 'TWD', TH: 'THB', MY: 'MYR',
    PH: 'PHP', ID: 'IDR', VN: 'VND', SA: 'SAR', AE: 'AED',
    IL: 'ILS', EG: 'EGP', NG: 'NGN', KE: 'KES', AR: 'ARS',
    CL: 'CLP', CO: 'COP', PE: 'PEN',
  };
  return map[countryCode];
}
