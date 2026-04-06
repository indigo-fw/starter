import { eq } from 'drizzle-orm';

import { createLogger } from '@/core/lib/logger';
import { db } from '@/server/db';
import { saasUserAcquisitions } from '@/core-affiliates/schema/attributions';

const log = createLogger('attribution');

/** Data captured client-side and sent to server after authentication. */
export interface AttributionData {
  refCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /** Less common fields: utm_term, utm_content, referrer, landing_page, etc. */
  extra?: Record<string, string>;
}

/**
 * Store first-touch marketing attribution for a user.
 * If the ref code matches an active affiliate, also triggers affiliate referral capture.
 *
 * Fire-and-forget — catches all errors.
 */
export async function captureAttribution(userId: string, data: AttributionData): Promise<void> {
  try {
    // Check if attribution already exists (first-touch only)
    const [existing] = await db
      .select({ id: saasUserAcquisitions.id })
      .from(saasUserAcquisitions)
      .where(eq(saasUserAcquisitions.userId, userId))
      .limit(1);

    if (existing) {
      log.debug('Attribution already captured', { userId });
      return;
    }

    // Store attribution
    await db.insert(saasUserAcquisitions).values({
      userId,
      refCode: data.refCode ?? null,
      utmSource: data.utmSource ?? null,
      utmMedium: data.utmMedium ?? null,
      utmCampaign: data.utmCampaign ?? null,
      extra: data.extra ?? null,
    });

    log.info('Attribution captured', {
      userId,
      refCode: data.refCode,
      utmSource: data.utmSource,
      utmMedium: data.utmMedium,
    });

    // If ref code present, try to link to affiliate system
    if (data.refCode) {
      const { captureReferral } = await import('@/core-affiliates/lib/affiliates');
      await captureReferral(userId, data.refCode);
    }
  } catch (err) {
    log.error('Failed to capture attribution', { userId, error: String(err) });
  }
}
