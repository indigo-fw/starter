'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { Metric } from 'web-vitals';
import { useSession } from '@/lib/auth-client';
import { Policy } from '@/core/policy/policy';

type MetricName = 'CLS' | 'INP' | 'LCP' | 'FCP' | 'TTFB';
// Staff = editor / admin / superadmin (anyone with `canAccessAdmin()` true).
// Mirrors the project's RBAC tiers; `user` (plain registered) is the default
// non-anonymous bucket. No subscriber tier in indigo.
type Tier = 'anonymous' | 'registered' | 'staff';

interface VitalsPayload {
  name: MetricName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  id: string;
  delta: number;
  navigationType: string;
  page_path: string;
  user_tier: Tier;
  // INP-only
  inp_target?: string;
  inp_event_type?: string;
}

/** Compact CSS-selector-ish description of an element. Limited to 120 chars. */
function describeTarget(target: Node | null | undefined): string {
  if (!target || !(target instanceof Element)) return '';
  const tag = target.tagName.toLowerCase();
  const id = target.id ? `#${target.id}` : '';
  const cls =
    typeof target.className === 'string' && target.className
      ? '.' + target.className.trim().split(/\s+/).slice(0, 3).join('.')
      : '';
  const testId = target.getAttribute('data-testid');
  const testIdPart = testId ? `[data-testid="${testId}"]` : '';
  return `${tag}${id}${testIdPart}${cls}`.slice(0, 120);
}

function computeTier(user: { role?: string } | undefined): Tier {
  if (!user) return 'anonymous';
  return Policy.for(user.role).canAccessAdmin() ? 'staff' : 'registered';
}

function buildPayload(
  name: MetricName,
  metric: Metric,
  ctx: { pathname: string; tier: Tier }
): VitalsPayload {
  // CLS is a unitless score (0-1+); ×1000 so rounding to an int preserves
  // precision (web-vitals canonical pattern).
  const valueScale = name === 'CLS' ? 1000 : 1;
  const payload: VitalsPayload = {
    name,
    value: Math.round(metric.value * valueScale),
    rating: metric.rating,
    id: metric.id,
    delta: Math.round(metric.delta * valueScale),
    navigationType: metric.navigationType,
    page_path: ctx.pathname,
    user_tier: ctx.tier,
  };
  if (name === 'INP') {
    // The longest event entry is the one that drives the INP score;
    // its target is the element the user clicked.
    const longest = metric.entries.reduce<PerformanceEntry | null>(
      (worst, entry) =>
        !worst || entry.duration > worst.duration ? entry : worst,
      null
    );
    if (longest) {
      const eventEntry = longest as PerformanceEntry & { target?: Node | null };
      payload.inp_target = describeTarget(eventEntry.target);
      payload.inp_event_type = longest.name;
    }
  }
  return payload;
}

function send(payload: VitalsPayload) {
  const endpoint = process.env.NEXT_PUBLIC_VITALS_ENDPOINT;
  if (endpoint) {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, body);
    } else {
      fetch(endpoint, { body, method: 'POST', keepalive: true }).catch(() => {});
    }
  } else if (process.env.NODE_ENV === 'development') {
    console.debug(
      '[WebVitals]',
      payload.name,
      payload.value,
      payload.rating,
      payload.user_tier,
      payload.inp_target ? `target=${payload.inp_target}` : ''
    );
  }
}

export function WebVitals() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();

  // pathname always-current via ref (listeners read at fire time, not register time).
  // tier cached by role string so Policy.for() isn't called per render.
  const ctxRef = useRef<{ pathname: string; tier: Tier }>({
    pathname,
    tier: 'anonymous',
  });
  const tierCacheRef = useRef<{ role: string | undefined; tier: Tier }>({
    role: undefined,
    tier: 'anonymous',
  });
  ctxRef.current.pathname = pathname;
  const user = session?.user as { role?: string } | undefined;
  const role = user?.role;
  if (tierCacheRef.current.role !== role) {
    tierCacheRef.current = { role, tier: computeTier(user) };
  }
  ctxRef.current.tier = tierCacheRef.current.tier;

  // Buffer + replay for early metrics fired before session resolves. Better
  // Auth's useSession is async — `isPending=true` until the API call returns.
  // FCP/TTFB usually fire within ~50-500 ms (well within the session-fetch
  // window) and would otherwise report `anonymous` for an authed user. We
  // hold those metrics, then on resolution rebuild + send them with the
  // correct tier. INP/LCP/CLS fire later than session resolution in practice
  // and don't need buffering, but we apply the same logic uniformly.
  const sessionResolvedRef = useRef(false);
  const bufferRef = useRef<Array<{ name: MetricName; metric: Metric }>>([]);

  useEffect(() => {
    if (isPending || sessionResolvedRef.current) return;
    sessionResolvedRef.current = true;
    if (bufferRef.current.length === 0) return;
    const drained = bufferRef.current;
    bufferRef.current = [];
    for (const { name, metric } of drained) {
      send(buildPayload(name, metric, ctxRef.current));
    }
  }, [isPending]);

  useEffect(() => {
    let cancelled = false;
    import('web-vitals').then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
      if (cancelled) return;

      const report = (name: MetricName) => (metric: Metric) => {
        if (!sessionResolvedRef.current) {
          bufferRef.current.push({ name, metric });
          return;
        }
        send(buildPayload(name, metric, ctxRef.current));
      };

      onCLS(report('CLS'));
      onINP(report('INP'));
      onLCP(report('LCP'));
      onFCP(report('FCP'));
      onTTFB(report('TTFB'));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
