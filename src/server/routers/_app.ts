import { createTRPCRouter } from '../trpc';
import { analyticsRouter } from './analytics';
import { auditRouter } from './audit';
import { authRouter } from './auth';
import { categoriesRouter } from './categories';
import { cmsRouter } from './cms';
import { contentSearchRouter } from './content-search';
import { customFieldsRouter } from './custom-fields';
import { formsRouter } from './forms';
import { jobQueueRouter } from './job-queue';
import { mediaRouter } from './media';
import { menusRouter } from './menus';
import { optionsRouter } from './options';
import { portfolioRouter } from './portfolio';
import { reactionsRouter } from './reactions';
import { showcaseRouter } from './showcase';
import { redirectsRouter } from './redirects';
import { revisionsRouter } from './revisions';
import { tagsRouter } from './tags';
import { usersRouter } from './users';
import { organizationsRouter } from './organizations';
import { notificationsRouter } from './notifications';
import { projectsRouter } from './projects';
import { aiRouter } from './ai';
import { webhooksRouter } from './webhooks';
import { cmsLinkRouter } from './cms-link';
import { moduleRouters } from '@/generated/module-routers';

/**
 * Root tRPC router — combines all sub-routers.
 * Module routers are auto-generated from indigo.config.ts via `bun run indigo:sync`.
 */
export const appRouter = createTRPCRouter({
  // ─── Core routers (always present) ────────────────────────────────────────
  ai: aiRouter,
  analytics: analyticsRouter,
  audit: auditRouter,
  auth: authRouter,
  categories: categoriesRouter,
  cms: cmsRouter,
  cmsLink: cmsLinkRouter,
  contentSearch: contentSearchRouter,
  customFields: customFieldsRouter,
  forms: formsRouter,
  jobQueue: jobQueueRouter,
  media: mediaRouter,
  menus: menusRouter,
  notifications: notificationsRouter,
  options: optionsRouter,
  organizations: organizationsRouter,
  portfolio: portfolioRouter,
  projects: projectsRouter,
  reactions: reactionsRouter,
  redirects: redirectsRouter,
  revisions: revisionsRouter,
  showcase: showcaseRouter,
  tags: tagsRouter,
  users: usersRouter,
  webhooks: webhooksRouter,
  // ─── Module routers (from indigo.config.ts) ───────────────────────────────
  ...moduleRouters,
});

export type AppRouter = typeof appRouter;
