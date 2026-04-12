// Engine lib — shared utilities (re-exports from subdirectories)

// Content
export { slugify, slugifyFilename } from './content/slug';

// Markdown
export { htmlToMarkdown, markdownToHtml } from './markdown/markdown';
export { parseShortcodes } from './markdown/shortcodes-parser';
export { prepareForEditor, serializeForStorage } from './markdown/shortcode-utils';

// i18n
export { localePath } from './i18n/locale';
export { getLocale } from './i18n/locale-server';
export { useBlankTranslations, dataTranslations } from './i18n/translations';

// Infra
export { logAudit } from './infra/audit';
export type { LogAuditParams } from './infra/audit';
export { createQueue, createWorker, getQueues, shutdownAllWorkers } from './infra/queue';
export { getStats, invalidateStats, clearStatsCache } from './infra/stats-cache';

// API
export { applyRateLimit } from './api/trpc-rate-limit';
export { validateApiKey, checkRateLimit as checkApiRateLimit, apiHeaders } from './api/api-auth';
export { withApiRoute, parseApiPagination, paginatedApiResponse } from './api/api-route';

// Webhooks
export { dispatchWebhook } from './webhooks/webhooks';

// Analytics
export { getGA4Config, runGA4Report } from './analytics/ga4';
export { anonymizeUser, exportUserData } from './analytics/gdpr';

// Realtime
export { useWebSocket, useChannel } from './realtime/ws-client';
export { WS_CHANNELS } from './realtime/ws-channels';

// SEO
export { SEO_OVERRIDE_ROUTES, SEO_OVERRIDE_SLUGS } from './seo-routes';
export { generateSitemap } from './seo/sitemap';
export type { SitemapConfig, SitemapStaticPage, SitemapFetcher } from './seo/sitemap';
export { setCanonicalConfig, buildCanonicalUrl, buildAlternates } from './seo/canonical';

// Scope
export { withScope, withScopeAsync, getScope, getScopedKey } from './infra/scope';

// RSS
export { escapeXml, generateRssFeed, createRssResponse } from './content/rss';
export type { RssFeedConfig, RssFeedItem } from './content/rss';

// Search triggers
export { applySearchTriggers, buildSearchTriggerSql, buildBackfillSql, buildTsConfigFunction, DEFAULT_LANGUAGE_MAP } from './infra/search-triggers';
export type { SearchTriggerTable } from './infra/search-triggers';

// Email
export { setEmailDeps, enqueueTemplateEmail, enqueueEmail, startEmailWorker } from './email';
export type { EmailDeps, EmailBranding, EmailSendOptions } from './email';

// Cron
export { registerCronJob, startCronScheduler } from './infra/cron';

// Maintenance
export { registerMaintenanceTask, runAllMaintenanceTasks } from './infra/maintenance';

// Scheduled content publishing
export { registerScheduledPublishTarget, processScheduledContent, startContentPublishWorker } from './content/scheduled-publish';

// Health check
export { createHealthHandler } from './api/health';
export type { HealthCheckDef } from './api/health';

// Consent
export { useConsent, ConsentProvider } from './consent/context';
export type { ConsentCategory, ConsentState, BuiltInConsentCategory } from './consent/types';
export { DEFAULT_CATEGORIES, DEFAULT_CONSENT, buildDefaultConsent } from './consent/types';
export { getStoredConsent, setStoredConsent, hasConsentChoice } from './consent/storage';
export type { ConsentStorageOptions } from './consent/storage';
