import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { LOCALES, DEFAULT_LOCALE } from '@/lib/constants';
import { siteConfig } from '@/config/site';
import type { Locale } from '@/lib/constants';
import { DASHBOARD_PREFIX, ACCOUNT_PREFIX, PUBLIC_ADMIN_PATHS, adminRoutes, publicAuthRoutes } from '@/config/routes';
import { auth } from '@/lib/auth';
import { isEmailVerificationRequired } from '@/lib/email-verification';

/**
 * Next.js 16 Proxy — runs before routes are rendered.
 *
 * Handles four concerns:
 * 1. Edge rate limiting (IP-based, in-memory)
 * 2. Dashboard auth gating (session cookie check)
 * 3. Locale prefix detection + URL rewriting for i18n
 * 4. Nonce-based Content Security Policy
 */

// ─── Edge rate limiting ─────────────────────────────────────────────────────

import { edgeRateLimit } from '@/core/lib/api/edge-rate-limit';

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // requests per window per IP
const RATE_LIMIT_PATHS = ['/api/auth/', '/api/trpc/', '/api/v1/'];

/** Non-default locale codes for prefix matching */
const NON_DEFAULT_LOCALE_SET: Set<string> = new Set(
  LOCALES.filter((l) => l !== DEFAULT_LOCALE)
);

/** Generate a cryptographic nonce and set nonce-based CSP on the response. */
function withCsp(response: NextResponse): NextResponse {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: https://www.google-analytics.com https://region1.google-analytics.com",
    "frame-src 'self' https://www.youtube.com https://js.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);
  return response;
}

const VERIFY_EMAIL_PATH = publicAuthRoutes.verifyEmail;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Edge rate limiting ──
  if (RATE_LIMIT_PATHS.some((p) => pathname.startsWith(p))) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown';
    if (!(await edgeRateLimit(ip, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX))) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    }
  }

  // ── Dashboard auth gating ──
  if (pathname.startsWith(DASHBOARD_PREFIX)) {
    if (PUBLIC_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return withCsp(NextResponse.next());
    }

    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL(adminRoutes.login, request.url));
    }

    return withCsp(NextResponse.next());
  }

  // ── Customer account auth gating ──
  if (pathname.startsWith(ACCOUNT_PREFIX)) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL(`${publicAuthRoutes.login}?callbackUrl=${encodeURIComponent(pathname)}`, request.url));
    }

    // Check email verification grace period
    const session = await auth.api.getSession({ headers: request.headers });
    const u = session?.user as Record<string, unknown> | undefined;
    if (
      u &&
      isEmailVerificationRequired({
        emailVerified: (u.emailVerified as boolean) ?? false,
        createdAt: (u.createdAt as string) ?? new Date().toISOString(),
      })
    ) {
      return NextResponse.redirect(new URL(VERIFY_EMAIL_PATH, request.url));
    }
  }

  // ── Verify-email page — redirect away if already verified ──
  if (pathname === VERIFY_EMAIL_PATH) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL(publicAuthRoutes.login, request.url));
    }
  }

  // ── Auto-detect locale from Accept-Language (opt-in) ──
  if (
    siteConfig.localeAutoDetect &&
    !request.cookies.get('locale-chosen')
  ) {
    const segments = pathname.split('/');
    const firstSegment = segments[1];
    // Only auto-detect when no locale prefix is present
    if (!firstSegment || !NON_DEFAULT_LOCALE_SET.has(firstSegment)) {
      const acceptLang = request.headers.get('accept-language');
      if (acceptLang) {
        const preferred = acceptLang
          .split(',')
          .map((p) => p.trim().split(';')[0]!.split('-')[0]!.toLowerCase());
        for (const code of preferred) {
          if (code !== DEFAULT_LOCALE && NON_DEFAULT_LOCALE_SET.has(code)) {
            const url = request.nextUrl.clone();
            url.pathname = `/${code}${pathname}`;
            return NextResponse.redirect(url);
          }
        }
      }
    }
  }

  // ── Locale prefix detection + rewrite ──
  // Check if first path segment is a non-default locale
  const segments = pathname.split('/');
  const firstSegment = segments[1]; // segments[0] is '' (leading slash)

  // Normalize uppercase locale codes (e.g. /DE/blog → /de/blog)
  if (firstSegment && NON_DEFAULT_LOCALE_SET.has(firstSegment.toLowerCase()) && firstSegment !== firstSegment.toLowerCase()) {
    const url = request.nextUrl.clone();
    url.pathname = `/${firstSegment.toLowerCase()}${segments.slice(2).length ? '/' + segments.slice(2).join('/') : ''}`;
    return NextResponse.redirect(url, 301);
  }

  if (firstSegment && NON_DEFAULT_LOCALE_SET.has(firstSegment)) {
    const locale = firstSegment as Locale;
    // Strip the locale prefix: /de/blog/post → /blog/post
    const strippedPath = '/' + segments.slice(2).join('/') || '/';
    const url = request.nextUrl.clone();
    url.pathname = strippedPath;

    const response = NextResponse.rewrite(url);
    response.headers.set('x-locale', locale);
    return withCsp(response);
  }

  // Default locale — no rewrite, set header for consistency
  const response = NextResponse.next();
  response.headers.set('x-locale', DEFAULT_LOCALE);
  return withCsp(response);
}

export const config = {
  matcher: ['/((?!api|_next|uploads|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)'],
};
