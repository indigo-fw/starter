import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Image optimization is handled by CDN (e.g. Cloudflare Image Resizing) in production.
  // Disable Next.js image proxy — all sizing/cropping is CSS-driven.
  images: {
    unoptimized: true,
  },

  // Allow per-instance .next dirs so multiple instances can run on the same
  // checkout (e.g. local two-instance Redis pub/sub testing). In production
  // each replica has its own deployed copy and doesn't need this.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),

  // Keep the queue/redis clients out of the server bundle: BullMQ spawns
  // sandboxed processors and ioredis ships native-ish lazy requires that
  // bundlers mangle. They're plain `require`s from node_modules at runtime.
  serverExternalPackages: ['bullmq', 'ioredis'],

  // Security headers for all routes
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          // Browsers ignore HSTS over plain HTTP, so this is inert in local dev
          // and only takes effect once the site is served over TLS. No
          // `preload` — that is a long-lived, hard-to-revoke public commitment
          // a project should opt into deliberately.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // CSP is set dynamically in proxy.ts with per-request nonces.
          // Static directives that don't need nonces are kept here as a fallback
          // for routes not covered by the proxy (API, _next, uploads).
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' ws: wss: https://www.google-analytics.com https://region1.google-analytics.com",
              "frame-src 'self' https://www.youtube.com https://js.stripe.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  // Allow serving uploaded files from /uploads
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*',
      },
    ];
  },

  // Note: /forgot-password and /reset-password are now customer-facing pages
  // in (public)/ — no redirects needed.
};

export default function config(phase: string): NextConfig {
  // `next build` with NODE_ENV=development (a stray shell export, a CI job
  // that sets it globally) emits a dev-mode bundle whose prerender step then
  // crashes with an unrelated-looking error. Fail loudly at the real cause.
  if (
    phase === PHASE_PRODUCTION_BUILD &&
    process.env.NODE_ENV !== 'production'
  ) {
    throw new Error(
      `next build requires NODE_ENV=production (got "${process.env.NODE_ENV}"). ` +
        'Unset NODE_ENV or export NODE_ENV=production before building.'
    );
  }
  return withNextIntl(nextConfig);
}
