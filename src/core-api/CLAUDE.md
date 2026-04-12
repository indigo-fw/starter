# core-api — CLAUDE.md

Paid module for org-scoped REST API with key management, scopes, rate limiting, and usage metering.

## Module Boundary

**core-api owns:** API key schema (2 tables), key service (generate/verify/revoke/roll), scope registry, v2 route wrapper, api-keys tRPC router, ApiKeyManager UI component, maintenance tasks.

**Project owns:** v2 REST endpoints (`app/api/v2/`), admin page, account page, dependency wiring (`config/api-deps.ts`), project-specific scope registration.

## Import Rules

- core-api imports from `@/core/*` (core utilities)
- Framework conventions imported directly: `@/server/trpc`, `@/server/db`, `@/server/db/schema/organization`
- No cross-module imports — metering is injected via `deductApiCallToken` dep
- Project imports from `@/core-api/*`
- Core (`src/core/`) never imports from core-api

## Key Statuses

| Status | Meaning |
|--------|---------|
| `active` | Normal working key |
| `expiring` | Rolled — still works until `expiresAt`, doesn't count against active limit |
| `expired` | Past `expiresAt`, set by maintenance task, rejected at verification |
| `revoked` | Manually revoked, immediate, permanent |

## Dependency Injection

`deps.ts` defines `ApiDeps`. Project calls `setApiDeps()` at startup. Injected deps:

- **resolveOrgId** — resolve active org for a user
- **deductApiCallToken** — optional token metering per API call (integrates with core-subscriptions)

## Scope System

`lib/api-scopes.ts` — extensible registry. Core registers CMS scopes (read:posts, read:categories, read:tags, read:menus). Other modules and the project register their own scopes at startup:

```typescript
import { registerApiScopes } from '@/core-api/lib/api-scopes';
registerApiScopes([
  { id: 'read:products', label: 'Read products', module: 'core-store' },
]);
```

Key scopes: `null` = superkey (all access). `[]` = no access. `['read:posts']` = specific scopes.

## Webhook Events

- `api_key.created` — key created (includes prefix, scopes)
- `api_key.revoked` — key revoked (includes prefix)
- `api_key.rolled` — key rotated (includes old/new key IDs, grace period)

## Maintenance Tasks

- `cleanupOldApiRequestLogs` — purges request logs older than 90 days
- `expireOldApiKeys` — sets `status='expired'` on keys past `expiresAt`

## v1 vs v2

- **v1** (`/api/v1/`) — global API key from `cms_options`, read-only CMS content. Free, stays in core.
- **v2** (`/api/v2/`) — org-scoped Bearer token auth, scope-checked, rate-limited per key, metered. Premium, requires core-api module.

## tRPC Router (`apiKeys`)

**Customer (protectedProcedure, admin-gated):** list, create, revoke, roll, rename, updateScopes, getScopes, getKeyStats.

**Admin (sectionProcedure):** adminGetLogs, adminListKeys.

## Wiring Into a Project

1. **Deps:** Create `config/api-deps.ts` calling `setApiDeps()` + `registerApiScopes()` for project-specific scopes
2. **Routers/schema:** Auto-registered via `indigo:sync`
3. **Endpoints:** Create v2 routes in `app/api/v2/` using `withApiV2Route()`
4. **Scopes:** Other modules register scopes in their `serverInit` files
5. **Metering:** Uncomment `deductApiCallToken` in deps to enable token-based metering
