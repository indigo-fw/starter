'use client';

import { useEffect, useRef } from 'react';

import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc/client';
import { useConsentSafe } from '@/core/lib/consent/context';

const COOKIE_NAME = 'indigo_attribution';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/** URL params to capture. ref + standard UTM params. */
const TRACKED_PARAMS = ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

/**
 * Captures marketing attribution data from URL params into a cookie,
 * then sends it to the server after authentication.
 *
 * Tracked params: ?ref=, ?utm_source=, ?utm_medium=, ?utm_campaign=, ?utm_term=, ?utm_content=
 * Also captures document.referrer and landing page URL.
 *
 * First-touch: only sets the cookie if no attribution cookie exists yet.
 * Renders nothing — drop into any layout.
 *
 * Consent: this component is also wrapped by <ConsentGate category="marketing">
 * at the layout-rendering site (via WidgetEntry.consentCategory). The internal
 * check below is defense-in-depth — if a host project ever renders this widget
 * without the wrapper (or without a <ConsentProvider> at all), we still refuse
 * to write the marketing cookie. The effect re-fires when consent flips to true,
 * so users who accept marketing on the same pageview as their UTM landing still
 * get captured.
 */
export function AttributionCapture() {
  const { data: session } = useSession();
  const captured = useRef(false);
  const captureAttribution = trpc.auth.captureAttribution.useMutation();

  // Soft consent read — null when no <ConsentProvider> is in the tree.
  // Without consent infrastructure or without explicit marketing consent,
  // we don't read the URL, don't read the referrer, and don't write the cookie.
  const consentCtx = useConsentSafe();
  const marketingConsent = consentCtx?.consent.marketing ?? false;

  // Step 1: Capture attribution params into cookie (first-touch only, post-consent).
  useEffect(() => {
    if (!marketingConsent) return;

    // Don't overwrite existing attribution
    if (getCookie(COOKIE_NAME)) return;

    const params = new URLSearchParams(window.location.search);
    const data: Record<string, string> = {};

    for (const key of TRACKED_PARAMS) {
      const value = params.get(key)?.trim().slice(0, 500);
      if (value) data[key] = value;
    }

    // Also capture referrer and landing page
    if (document.referrer && !document.referrer.includes(window.location.host)) {
      data.referrer = document.referrer.slice(0, 2000);
    }
    data.landing_page = (window.location.pathname + window.location.search).slice(0, 2000);

    // Only store if there's something meaningful
    if (Object.keys(data).length > 1 || data.ref) {
      setCookie(COOKIE_NAME, JSON.stringify(data));
    }
  }, [marketingConsent]);

  // Step 2: After auth, send attribution to server and clear cookie.
  useEffect(() => {
    if (!marketingConsent) return;
    if (!session?.user?.id || captured.current) return;
    const raw = getCookie(COOKIE_NAME);
    if (!raw) return;

    captured.current = true;
    clearCookie(COOKIE_NAME);

    try {
      const data = JSON.parse(raw) as Record<string, string>;
      const { ref, utm_source, utm_medium, utm_campaign, utm_term, utm_content, ...rest } = data;

      captureAttribution.mutate({
        refCode: ref,
        utmSource: utm_source,
        utmMedium: utm_medium,
        utmCampaign: utm_campaign,
        extra: {
          ...(utm_term ? { utm_term } : {}),
          ...(utm_content ? { utm_content } : {}),
          ...rest,
        },
      });
    } catch {
      // Malformed cookie — ignore
    }
  }, [marketingConsent, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When marketing consent is withdrawn, sweep up any leftover attribution cookie.
  useEffect(() => {
    if (marketingConsent) return;
    if (getCookie(COOKIE_NAME)) clearCookie(COOKIE_NAME);
  }, [marketingConsent]);

  return null;
}
