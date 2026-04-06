import { cmsOptions } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import type { DbClient } from '@/server/db';

interface GA4Config {
  propertyId: string;
  serviceAccountJson: string;
}

interface GA4Row {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}

interface GA4ReportResponse {
  rows?: GA4Row[];
}

// JWT token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Load GA4 config from cms_options */
export async function getGA4Config(db: DbClient): Promise<GA4Config | null> {
  const [propRow, jsonRow] = await Promise.all([
    db.query.cmsOptions.findFirst({ where: eq(cmsOptions.key, 'ga4.propertyId') }),
    db.query.cmsOptions.findFirst({ where: eq(cmsOptions.key, 'ga4.serviceAccountJson') }),
  ]);
  const propertyId = propRow?.value as string | undefined;
  const serviceAccountJson = jsonRow?.value as string | undefined;
  if (!propertyId || !serviceAccountJson) return null;
  return { propertyId, serviceAccountJson };
}

/** Create a JWT, exchange for access token */
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsignedToken = `${enc(header)}.${enc(payload)}`;

  // Import RSA private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const keyBuffer = Buffer.from(pemBody, 'base64');
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsignedToken)
  );
  const sig = Buffer.from(signature).toString('base64url');
  const jwt = `${unsignedToken}.${sig}`;

  // Exchange JWT for access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function ga4Fetch(token: string, propertyId: string, body: Record<string, unknown>): Promise<GA4ReportResponse> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 API error ${res.status}: ${text}`);
  }
  return res.json();
}

export interface GA4Overview {
  totalPageViews: number;
  totalSessions: number;
  dailyViews: { date: string; views: number }[];
  topPages: { path: string; views: number }[];
}

export async function runGA4Report(config: GA4Config, days: number): Promise<GA4Overview> {
  const token = await getAccessToken(config.serviceAccountJson);
  const dateRange = { startDate: `${days}daysAgo`, endDate: 'today' };

  const [overview, daily, topPages] = await Promise.all([
    ga4Fetch(token, config.propertyId, {
      dateRanges: [dateRange],
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
    }),
    ga4Fetch(token, config.propertyId, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    }),
    ga4Fetch(token, config.propertyId, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    }),
  ]);

  const row0 = overview.rows?.[0];
  return {
    totalPageViews: Number(row0?.metricValues?.[0]?.value ?? 0),
    totalSessions: Number(row0?.metricValues?.[1]?.value ?? 0),
    dailyViews: (daily.rows ?? []).map((r) => ({
      date: r.dimensionValues?.[0]?.value ?? '',
      views: Number(r.metricValues?.[0]?.value ?? 0),
    })),
    topPages: (topPages.rows ?? []).map((r) => ({
      path: r.dimensionValues?.[0]?.value ?? '',
      views: Number(r.metricValues?.[0]?.value ?? 0),
    })),
  };
}
