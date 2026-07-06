/**
 * Server-side consent reader — keeps the banner SSR-stable.
 *
 * The cookie is the persistent source of truth (see ./storage.ts). On the
 * server we read it via next/headers so the public layout can pass it to
 * <ConsentProvider initialConsent={...}>, eliminating the hydration flash
 * where consent-gated UI flickers between "no consent" (SSR) and "consented"
 * (post-hydration localStorage read).
 */

import 'server-only';

import { cookies } from 'next/headers';
import type { StoredConsent } from './types';
import { parseStoredConsent } from './types';

const DEFAULT_COOKIE_NAME = 'indigo-consent';

export interface ServerConsentOptions {
  cookieName?: string;
}

/**
 * Read the consent cookie on the server. Returns null when no record exists
 * or the cookie is malformed/tampered. Always safe to call.
 */
export async function getServerConsent(
  options?: ServerConsentOptions,
): Promise<StoredConsent | null> {
  try {
    const store = await cookies();
    const raw = store.get(options?.cookieName ?? DEFAULT_COOKIE_NAME)?.value;
    if (!raw) return null;
    return parseStoredConsent(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}
