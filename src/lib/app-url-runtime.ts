/**
 * Runtime-safe canonical app URL — NO 'server-only' guard.
 *
 * Same split as cms-link / cms-link-sync (see CLAUDE.md): the `server-only`
 * package throws outside Next.js webpack's `react-server` condition, so any
 * module loaded Bun-direct (server.ts serverInit chain, CLI scripts) must not
 * transitively import it. Deps files import from HERE; Next.js server code
 * can keep importing `@/lib/app-url`, which re-exports this with the guard.
 */

import { siteConfig } from '@/config/site';

/**
 * Canonical app URL for server-side use (Route Handlers, emails, webhooks).
 *
 * `BETTER_AUTH_URL` is a server-only runtime variable that is never inlined
 * at build time — it always reflects the actual deployed domain, unlike
 * NEXT_PUBLIC_* vars which get baked into pre-built Docker images.
 */
export function getServerAppUrl(): string {
  return process.env.BETTER_AUTH_URL ?? siteConfig.url;
}
