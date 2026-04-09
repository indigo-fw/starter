/**
 * Centralized route definitions — single source of truth.
 *
 * Every hardcoded path in the app should reference these constants
 * so renaming a route prefix (e.g. /dashboard → /admin) is a one-line change.
 */

// ─── Base prefixes ───────────────────────────────────────────────────────────

export const DASHBOARD_PREFIX = '/dashboard';
export const ACCOUNT_PREFIX = '/account';

// ─── Admin auth ──────────────────────────────────────────────────────────────

export const adminRoutes = {
  home: DASHBOARD_PREFIX,
  login: `${DASHBOARD_PREFIX}/login`,
  register: `${DASHBOARD_PREFIX}/register`,
  forgotPassword: `${DASHBOARD_PREFIX}/forgot-password`,
  resetPassword: `${DASHBOARD_PREFIX}/reset-password`,
} as const;

/** Paths accessible without session cookie */
export const PUBLIC_ADMIN_PATHS = [
  adminRoutes.login,
  adminRoutes.register,
  adminRoutes.forgotPassword,
  adminRoutes.resetPassword,
];

// ─── Admin panel sections ────────────────────────────────────────────────────

export const adminPanel = {
  // CMS
  cms: (section: string) => `${DASHBOARD_PREFIX}/cms/${section}`,
  cmsItem: (section: string, id: string) => `${DASHBOARD_PREFIX}/cms/${section}/${id}`,
  cmsNew: (section: string) => `${DASHBOARD_PREFIX}/cms/${section}/new`,
  menus: `${DASHBOARD_PREFIX}/cms/menus`,
  menuDetail: (id: string) => `${DASHBOARD_PREFIX}/cms/menus/${id}`,
  redirects: `${DASHBOARD_PREFIX}/cms/redirects`,
  calendar: `${DASHBOARD_PREFIX}/cms/calendar`,
  activity: `${DASHBOARD_PREFIX}/cms/activity`,

  // Top-level sections
  media: `${DASHBOARD_PREFIX}/media`,
  users: `${DASHBOARD_PREFIX}/users`,
  userDetail: (id: string) => `${DASHBOARD_PREFIX}/users/${id}`,
  forms: `${DASHBOARD_PREFIX}/forms`,
  formDetail: (id: string) => `${DASHBOARD_PREFIX}/forms/${id}`,
  formNew: `${DASHBOARD_PREFIX}/forms/new`,
  formSubmissions: (id: string) => `${DASHBOARD_PREFIX}/forms/${id}/submissions`,
  organizations: `${DASHBOARD_PREFIX}/organizations`,
  notifications: `${DASHBOARD_PREFIX}/notifications`,
  projects: `${DASHBOARD_PREFIX}/projects`,

  // Settings
  settings: `${DASHBOARD_PREFIX}/settings`,
  settingsBilling: `${DASHBOARD_PREFIX}/settings/billing`,
  settingsCustomFields: `${DASHBOARD_PREFIX}/settings/custom-fields`,
  settingsWebhooks: `${DASHBOARD_PREFIX}/settings/webhooks`,
  settingsJobQueue: `${DASHBOARD_PREFIX}/settings/job-queue`,
  settingsEmailTemplates: `${DASHBOARD_PREFIX}/settings/email-templates`,
  settingsImport: `${DASHBOARD_PREFIX}/settings/import`,
  settingsDiscountCodes: `${DASHBOARD_PREFIX}/settings/discount-codes`,
  settingsSupport: `${DASHBOARD_PREFIX}/settings/support`,
  settingsSupportDetail: (id: string) => `${DASHBOARD_PREFIX}/settings/support/${id}`,
  settingsSupportChat: (id: string) => `${DASHBOARD_PREFIX}/settings/support/chat/${id}`,
  settingsAffiliates: `${DASHBOARD_PREFIX}/settings/affiliates`,
} as const;

// ─── Customer-facing auth ────────────────────────────────────────────────────

export const publicAuthRoutes = {
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
} as const;

// ─── Customer account ────────────────────────────────────────────────────────

export const accountRoutes = {
  home: ACCOUNT_PREFIX,
  settings: `${ACCOUNT_PREFIX}/settings`,
  security: `${ACCOUNT_PREFIX}/security`,
  billing: `${ACCOUNT_PREFIX}/billing`,
  support: `${ACCOUNT_PREFIX}/support`,
  supportNew: `${ACCOUNT_PREFIX}/support/new`,
  supportDetail: (id: string) => `${ACCOUNT_PREFIX}/support/${id}`,
  affiliates: `${ACCOUNT_PREFIX}/affiliates`,
} as const;

// ─── Public content ──────────────────────────────────────────────────────────

export const contentRoutes = {
  blog: '/blog',
  portfolio: '/portfolio',
  showcase: '/showcase',
  pricing: '/pricing',
  search: '/search',
  store: '/store',
  cart: '/cart',
} as const;

// ─── API ─────────────────────────────────────────────────────────────────────

export const apiRoutes = {
  upload: '/api/upload',
  trpc: '/api/trpc',
  feedBlog: '/api/feed/blog',
  feedTag: (slug: string) => `/api/feed/tag/${slug}`,
  gdprExport: (id?: string) => id ? `/api/gdpr-export/${id}` : '/api/gdpr-export',
} as const;
