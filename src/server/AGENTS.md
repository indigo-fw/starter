# Server — AGENTS.md

## tRPC

**Procedure types:** `publicProcedure`, `protectedProcedure`, `staffProcedure`, `sectionProcedure(section)`, `superadminProcedure`.

**Client:** `trpc.cms.list.useQuery()` from `@/lib/trpc/client`. **Server:** `const api = await serverTRPC()` from `@/lib/trpc/server`. Uses `httpBatchStreamLink`.

**CMS router:** Split into `src/server/routers/cms/` directory — `posts.ts` (admin CRUD), `public.ts` (public endpoints + SEO overrides), `attachments.ts`, `scheduling.ts`, `_shared.ts` (shared constants). Composed via `mergeRouters` in `index.ts`. API surface unchanged (`trpc.cms.*`).

## Roles & Permissions

4 roles: `user`, `editor`, `admin`, `superadmin`.

- **Never** hardcode role strings like `role === 'admin'` — use `Role.*` consts or `Policy.for(role).can(...)`
- `Policy.for()` normalizes unknown/null to `Role.USER` (fail-closed)
- `isSuperAdmin(role)` for superadmin-only checks
- Admin sections: `dashboard`, `content`, `media`, `structure`, `users`, `settings`, `billing`, `organizations`
- Editors can access: dashboard, content, media, structure. Admins+ get the rest

## Non-Obvious Patterns

- **Email:** Use `enqueueEmail()` / `enqueueTemplateEmail()` from `@/core/lib/email` — never call `sendEmail()` directly. Project-specific `TemplateName` type lives in `@/server/jobs/email`. Wire branding via `setEmailDeps()` in `src/config/deps/email-deps.ts`
- **Typed hooks:** `registerHook`/`runHook`/`runGuard` are type-safe via `HookMap`. Event ownership follows the *emitter*: events fired by always-present code (auth, ws, organizations routers) are declared in core's `HookMap` even when only optional modules consume them — a module-owned declaration would break typecheck when that module is removed. Module-owned events (emitted and consumed inside one module) may still declare via merging
- **Fire-and-forget:** All fire-and-forget operations (audit, webhooks, notifications) must log errors via `createLogger()`, never silently swallow
- **Bans bite immediately:** `users.ban` deletes the user's DB sessions **and** calls `invalidateUserSessions()` (`@/core/lib/auth/session-invalidation`) — Better Auth's `cookieCache` would otherwise keep the banned user signed in for up to 5 min; `anonymizeUser()` does the same. Temporary bans (`banExpires`) are lifted by the daily `expireLapsedBans` maintenance task; Better Auth alone only clears them at the user's next sign-in
- **Email failures:** SMTP 5xx / `EENVELOPE` / `EAUTH` (or a thrown `PermanentEmailError`) become a BullMQ `UnrecoverableError` in the worker — the job fails now instead of retrying for hours. GDPR-anonymized addresses are refused at the queue
- **Bulk vs transactional email:** pass `{ userId, channel }` to `enqueueEmail`/`enqueueTemplateEmail` for anything marketing-shaped — it skips muted recipients, adds RFC 8058 one-click headers, and gives the template `{{unsubscribeUrl}}`. Opt-out state lives in `cms_user_preferences` under `emailChannels` (absent = subscribed); `/api/email/unsubscribe` is deliberately unauthenticated and acts on an HMAC token scoped to one user + one channel
- **Migrations:** `db:migrate` runs `src/scripts/migrate.ts`, which takes a Postgres advisory lock so replicas booting together serialize instead of racing (`db:migrate:kit` is the raw drizzle-kit escape hatch). It fixes concurrency only — a breaking schema change still needs expand/contract across two deploys
- **Notifications:** `sendNotification()` is fire-and-forget (DB insert + WS broadcast + web push if VAPID configured). `sendOrgNotification()`, `sendBulkNotification()` for bulk. Push subscriptions in `saas_push_subscriptions`
- **Why organizations always exist:** Billing, tokens, subscriptions, and permissions all hang off orgs. Every user gets a personal org on signup so these systems work uniformly without special-casing "no org" paths. In B2C mode (`ORGANIZATIONS_VISIBLE=false`) the UI hides orgs but the data model stays. Don't remove this — it avoids a drastic rework
- **Org resolution:** `resolveOrgId(activeOrganizationId, userId)` — all org-scoped procedures use this. Falls back to user's first org if no active org set
- **Token race-safety:** `deductTokens()` uses atomic `UPDATE WHERE balance >= amount` — never do read-then-write
- **"Insert under a per-user count limit" race-safety:** for "subscribe to a source if under N", "create a project if under N", etc., a plain `SELECT count(*)` then `INSERT` lets two concurrent requests both pass the check. Wrap the recount + insert in a `db.transaction()` and take a per-user advisory lock first: ``await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`)`` — it auto-releases at COMMIT/ROLLBACK, so concurrent calls for the same user serialize (different users don't contend). A fast pre-check *outside* the txn is still worth keeping to skip expensive work when you'd reject anyway.
- **Billing is provider-agnostic:** Stripe + NOWPayments via `registerPaymentProvider()` factory. Org-scoped (not user-scoped). Disabled if no provider keys configured
- **`cms_term_relationships`:** Polymorphic M:N — `taxonomyId` discriminator decides what `termId` points to (`'category'` → `cms_categories`, `'tag'` → `cms_terms`). No FK on termId (app-level enforcement)
- **Post author:** `cmsPosts.authorId` auto-set to creating user. PostDetail resolves author name via `user` table join for byline + JSON-LD. Multi-author support planned for `core-news` module

## SERVER_ROLE (Production Scaling)

| Role | Next.js | tRPC | BullMQ | WebSocket |
|---|---|---|---|---|
| `all` (default) | yes | yes | yes | yes |
| `frontend` | yes | — | — | — |
| `api` | yes | yes | — | yes |
| `worker` | — | — | yes | — |

`worker` still answers `GET /api/health` from `server.ts` (no Next.js) so container probes pass. `server.ts` owns the process invariants — crash backstops, 25 s time-boxed shutdown, memory heartbeat, `MEMORY_MAX_RSS_MB` restart guard; see its header before touching startup/shutdown.
