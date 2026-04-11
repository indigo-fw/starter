/**
 * CMS Link configuration — wires project content types + static routes into the core resolver.
 *
 * Import this file as a side effect wherever cms:// resolution is needed.
 * Module-level code runs once (JS modules are singletons), so repeated imports are free.
 */
import { configureCmsLinksFromContentTypes } from '@/core/lib/content/cms-link';
import { CONTENT_TYPES } from '@/config/cms';
import { routing } from '@/i18n/routing';

const staticRoutes = Object.keys(routing.pathnames).filter(
  (p) => !p.includes('['),
);

configureCmsLinksFromContentTypes(CONTENT_TYPES, { staticRoutes });
