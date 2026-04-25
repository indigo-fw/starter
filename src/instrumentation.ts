/**
 * Next.js instrumentation entry point — runs once when the Next.js server
 * boots, in the same module context as the rest of the Next.js server bundle.
 *
 * We use this to initialize cache state (CMS link resolver + content
 * variables) on the SAME module instances that routers and SSR will use
 * later. Calling these from the custom `server.ts` (Bun-direct) instead
 * would create separate module instances, leaving the Next.js-side caches
 * with never-initialized publishers and silently breaking cross-instance
 * cache invalidation in multi-server deploys.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  // Only Node.js runtime — Edge runtime doesn't have access to the DB / Redis.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Preload content variables cache + subscribe to Redis pub/sub invalidation.
  try {
    const { preloadContentVars, initContentVarsSync } = await import(
      '@/core/lib/content/vars'
    );
    await preloadContentVars();
    await initContentVarsSync();
    console.log('Content vars cache preloaded + sync initialized');
  } catch (error) {
    console.error('Failed to initialize content vars sync:', error);
    console.log('Running without cross-instance content vars invalidation');
  }

  // Subscribe to Redis pub/sub for CMS link cache invalidation.
  try {
    const { initCmsLinkSync } = await import(
      '@/core/lib/content/cms-link-sync'
    );
    await initCmsLinkSync();
    console.log('CMS link sync initialized');
  } catch (error) {
    console.error('Failed to initialize CMS link sync:', error);
    console.log('Running without cross-instance link cache invalidation');
  }
}
