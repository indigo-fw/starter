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

  // ── Locale handling ──
  //
  // Cookie: preferred_locale (1 year, strictly necessary).
  // Must be whitelisted in cookie consent tool (e.g. cookie-script.com).
  //
  // Flow:
  //   1. URL has locale prefix → set cookie + rewrite (non-default) or pass through (default)
  //   2. URL has no prefix → check cookie → redirect if non-default preference
  //   3. Neither → no redirect (Googlebot, first visitors)

  const LOCALE_COOKIE = 'preferred_locale';
  const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const segments = pathname.split('/');
  const firstSegment = segments[1] ?? '';
  const urlLocale =
    NON_DEFAULT_LOCALE_SET.has(firstSegment)
      ? firstSegment as Locale
      : firstSegment === DEFAULT_LOCALE
        ? DEFAULT_LOCALE as string
        : null;

  if (urlLocale) {
    // URL has explicit locale prefix → user chose this language.

    // Normalize uppercase locale codes (e.g. /DE/blog → /de/blog)
    if (firstSegment !== firstSegment.toLowerCase() && NON_DEFAULT_LOCALE_SET.has(firstSegment.toLowerCase())) {
      const url = request.nextUrl.clone();
      url.pathname = `/${firstSegment.toLowerCase()}${segments.slice(2).length ? '/' + segments.slice(2).join('/') : ''}`;
      return NextResponse.redirect(url, 301);
    }

    // Default locale prefix (/en/xxx): strip prefix via rewrite (same as non-default).
    // Indigo's App Router has no [locale] directory — it reads locale from x-locale header.
    if (urlLocale === DEFAULT_LOCALE) {
      const strippedPath = '/' + segments.slice(2).join('/') || '/';
      const url = request.nextUrl.clone();
      url.pathname = strippedPath;
      const response = NextResponse.rewrite(url);
      response.headers.set('x-locale', DEFAULT_LOCALE);
      if (cookieLocale !== DEFAULT_LOCALE) {
        response.cookies.set(LOCALE_COOKIE, DEFAULT_LOCALE, {
          path: '/',
          maxAge: LOCALE_COOKIE_MAX_AGE,
          sameSite: 'lax',
        });
      }
      return withCsp(response);
    }

    // Non-default locale prefix (/de/xxx, /es/xxx): rewrite to strip prefix.
    const strippedPath = '/' + segments.slice(2).join('/') || '/';
    const url = request.nextUrl.clone();
    url.pathname = strippedPath;

    const response = NextResponse.rewrite(url);
    response.headers.set('x-locale', urlLocale);
    if (cookieLocale !== urlLocale) {
      response.cookies.set(LOCALE_COOKIE, urlLocale, {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE,
        sameSite: 'lax',
      });
    }
    return withCsp(response);
  }

  // ── No locale prefix → check stored preference ──

  if (
    cookieLocale &&
    cookieLocale !== DEFAULT_LOCALE &&
    NON_DEFAULT_LOCALE_SET.has(cookieLocale)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = `/${cookieLocale}${pathname}`;
    return NextResponse.redirect(url);
  }

  // Auto-detect locale from Accept-Language (opt-in, only when no cookie)
  if (
    siteConfig.localeAutoDetect &&
    !cookieLocale
  ) {
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

  // Default locale — no rewrite, set header for consistency.
  const response = NextResponse.next();
  response.headers.set('x-locale', DEFAULT_LOCALE);
  return withCsp(response);
}

export const config = {
  matcher: ['/((?!api|_next|uploads|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)'],
};
