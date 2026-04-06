/** Site configuration — branding and defaults */

export const siteDefaults = {
  siteName: 'Indigo',
  siteUrl: 'http://localhost:3000',
  contactEmail: 'admin@indigo-fw.dev',
} as const;

export const clientEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? siteDefaults.siteUrl,
  siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? siteDefaults.siteName,
} as const;

export const siteConfig = {
  name: clientEnv.siteName,
  description: 'AI Agent-driven T3 SaaS starter with integrated CMS',
  url: clientEnv.appUrl,

  seo: {
    title: `${clientEnv.siteName} — AI Agent-driven T3 SaaS Starter`,
    description:
      'Open-source SaaS starter kit with integrated CMS, built on Next.js, tRPC, Drizzle, and Better Auth. Multi-tenancy, Stripe billing, real-time WebSocket, and more.',
  },

  /** Auto-detect locale from Accept-Language and redirect to matching prefix.
   * When false (default), users see content in the URL's locale and get a
   * suggestion banner instead. Set to true for apps where UX > SEO. */
  localeAutoDetect: false,

  /** Seconds after registration before unverified users are blocked.
   * Set to 0 to require immediate verification. Set to -1 to disable (never block). */
  emailVerificationGracePeriod: 24 * 60 * 60, // 24 hours
} as const;
