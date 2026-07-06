import 'server-only';

/**
 * Canonical app URL for Next.js server code (Route Handlers, robots.ts, etc.).
 *
 * The implementation lives in `app-url-runtime.ts` (no 'server-only' guard)
 * so Bun-direct code — serverInit deps files, CLI scripts — can import it
 * without tripping the react-server condition check. THIS module keeps the
 * guard so client components get a build error instead of leaking
 * BETTER_AUTH_URL handling into the browser bundle. Import from here in
 * Next.js server code; import from `app-url-runtime` in deps/scripts.
 */
export { getServerAppUrl } from './app-url-runtime';
