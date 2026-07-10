/** Site configuration — branding and defaults */

export const siteDefaults = {
  siteName: "Indigo",
  siteUrl: "http://localhost:3000",
  contactEmail: "info@indigo-fw.dev",
  companyName: "Indigo Inc.",
  companyAddress: "123 Main Street, City, Country",
  companyId: "N/A",
  companyJurisdiction: "the United States",
  companyVat: "",
  companyPhone: "",
  companyCountry: "",
  supportEmail: "",
} as const;

export const clientEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? siteDefaults.siteUrl,
  siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? siteDefaults.siteName,
} as const;

export const siteConfig = {
  name: clientEnv.siteName,
  description: "Built on Indigo — the open-source foundation for agent-built projects",
  url: clientEnv.appUrl,

  seo: {
    title: `${clientEnv.siteName} — Describe what you want. Your agent ships it — and proves it's done.`,
    description:
      "An Indigo install — the open-source Next.js foundation coding agents shape into a website, a blog, a shop, or a full SaaS. CMS, auth, billing, i18n and SEO pre-wired.",
    /** Default OG image for pages without a featured image.
     * Recommended: 1200x630px (1.91:1), JPG/PNG/WebP, under 1MB.
     * Path relative to public/ or absolute URL. */
    defaultOgImage: '/og-default.png',
  },

  social: {
    /** Twitter/X handle for twitter:site meta tag (e.g. '@indigo_fw') */
    twitter: '',
  },

  /** Auto-detect locale from Accept-Language and redirect to matching prefix.
   * When false (default), users see content in the URL's locale and get a
   * suggestion banner instead. Set to true for apps where UX > SEO. */
  localeAutoDetect: false,

  /** Seconds after registration before unverified users are blocked.
   * Set to 0 to require immediate verification. Set to -1 to disable (never block). */
  emailVerificationGracePeriod: 24 * 60 * 60, // 24 hours

  /** Showcase feed configuration. */
  showcase: {
    /** Show navigation dots on the left side of the feed. */
    showNavDots: true,
  },

  /** Theme behavior for the public frontend. */
  theme: {
    /**
     * Renderable themes the public theme switcher offers, in cycle order.
     * The first entry is the default theme.
     *   2+ entries — the switcher is shown. When the list has both 'light'
     *                and 'dark', a 'system' (follow-OS) state is also offered
     *                and becomes the default. 'system' is implicit — never
     *                list it here.
     *   1 entry    — that theme is forced; the switcher is hidden.
     * The admin dashboard always keeps its own independent light/dark switcher.
     */
    modes: ['light', 'dark'],
  },
} as const;
