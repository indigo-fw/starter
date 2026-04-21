# core-api

Org-scoped REST API module for Indigo. Adds API key management, Bearer token authentication, scope-based access control, per-key rate limiting, usage metering, and request logging.

## What it adds

- **API key management** — create, revoke, roll (rotate), rename, update scopes
- **Bearer token auth** — `Authorization: Bearer sk_live_...` on `/api/v2/` endpoints
- **Scope system** — extensible registry, modules register their own scopes
- **Per-key rate limiting** — Redis-backed, 60 req/min default (configurable per endpoint)
- **Request logging** — every v2 call logged with method, path, status, response time, IP
- **Usage metering** — optional token deduction per API call (integrates with core-subscriptions)
- **Key rotation** — roll creates a new key, old key expires after configurable grace period (default 24h)
- **Webhook events** — `api_key.created`, `api_key.revoked`, `api_key.rolled`
- **Maintenance** — auto-purges request logs (90 days) and expires old keys

## v1 vs v2

| | v1 (`/api/v1/`) | v2 (`/api/v2/`) |
|---|---|---|
| **Auth** | Global `x-api-key` header | Per-org `Authorization: Bearer` |
| **Scope** | No scopes | Per-key scope restrictions |
| **Data** | Public CMS content (posts, categories, tags, menus) | Org-scoped resources |
| **Rate limit** | Per IP (100/min) | Per key (60/min, configurable) |
| **Metering** | No | Optional token deduction |
| **Logging** | No | Full request audit trail |
| **Module** | Free (core) | Paid (core-api) |

## Quick start

```bash
bun run indigo add core-api
bun run indigo:sync
bun run db:generate
bun run db:migrate
```

This scaffolds the project-layer files into your `src/` directory.

## API key lifecycle

```
create → active
active → revoked       (immediate, permanent)
active → expiring      (via roll — grace period, new key issued)
expiring → expired     (maintenance task, after expiresAt)
active → expired       (maintenance task, if expiresAt was set manually)
```

Keys are never deleted — revoked/expired keys stay for audit purposes.

## Authentication

```bash
# Create a key via the dashboard or account page, then:
curl -H "Authorization: Bearer sk_live_abc123..." https://example.com/api/v2/projects
```

The Bearer token resolves to an organization. All v2 queries are automatically scoped to that org.

## Creating v2 endpoints

Use `withApiV2Route()` to wrap any Next.js route handler:

```typescript
// src/app/api/v2/projects/route.ts
import { withApiV2Route } from '@/core-api/lib/api-v2-route';

export async function GET(request: Request) {
  return withApiV2Route(request, { scope: 'read:projects' }, async (ctx) => {
    // ctx.organizationId — the org that owns this API key
    // ctx.key — the verified key record (id, scopes)
    // ctx.url — parsed URL for query params
    const projects = await db.select().from(saasProjects)
      .where(eq(saasProjects.organizationId, ctx.organizationId))
      .limit(50);
    return { data: projects };
  });
}
```

### Options

```typescript
withApiV2Route(request, {
  scope: 'read:projects',    // required scope
  rateLimit: 120,             // max requests per minute per key (default: 60)
  metered: true,              // deduct tokens per call (default: false)
}, handler);
```

## Scopes

Default CMS scopes are registered automatically:

| Scope | Description |
|-------|-------------|
| `read:posts` | Read posts |
| `read:categories` | Read categories |
| `read:tags` | Read tags |
| `read:menus` | Read menus |

### Registering custom scopes

In your module's `serverInit` file or in `config/deps/api-deps.ts`:

```typescript
import { registerApiScopes } from '@/core-api/lib/api-scopes';

registerApiScopes([
  { id: 'read:products', label: 'Read products', module: 'core-store' },
  { id: 'write:products', label: 'Create/update products', module: 'core-store' },
]);
```

### Key scope behavior

- `null` — superkey, all scopes granted
- `['read:posts', 'read:projects']` — only these scopes
- `[]` — no access (useful for temporarily disabling a key without revoking)

## Key rotation

Rolling a key creates a new replacement with the same name and scopes. The old key continues working during the grace period.

```
POST apiKeys.roll({ id: "key-uuid", gracePeriodHours: 24 })
→ { id: "new-key-uuid", key: "sk_live_...", prefix: "sk_live_abc12345", oldKeyExpiresAt: "..." }
```

- Default grace period: 24 hours
- Range: 0–168 hours (0 = immediate expiry)
- Old key status changes to `expiring` (doesn't count against 25-key limit)
- Maintenance task flips `expiring` → `expired` after `expiresAt` passes

## Token metering

To charge API calls against the org's token balance, uncomment in `config/deps/api-deps.ts`:

```typescript
setApiDeps({
  // ...
  async deductApiCallToken(orgId, _path) {
    const { deductTokens } = await import('@/core-subscriptions/lib/token-service');
    return deductTokens(orgId, 1, 'api_call', { type: 'api_v2' });
  },
});
```

Then set `metered: true` on endpoints that should consume tokens. Returns HTTP 402 when balance is insufficient.

## Database tables

### `saas_api_keys`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `organization_id` | uuid | FK to organization |
| `created_by` | uuid | User who created the key |
| `name` | varchar(255) | Human-readable name |
| `key_hash` | text | SHA-256 hash (plaintext never stored) |
| `prefix` | varchar(20) | First 16 chars for display |
| `scopes` | jsonb | String array, or null for superkey |
| `status` | varchar(20) | `active` / `expiring` / `expired` / `revoked` |
| `last_used_at` | timestamp | Updated on each API call |
| `expires_at` | timestamp | Optional expiry (set by roll or manual) |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### `saas_api_request_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `organization_id` | uuid | FK to organization |
| `api_key_id` | uuid | FK to saas_api_keys |
| `method` | varchar(10) | HTTP method |
| `path` | varchar(500) | Request path |
| `status_code` | integer | Response status |
| `response_time_ms` | integer | Handler duration |
| `ip_address` | varchar(50) | Client IP |
| `created_at` | timestamp | Purged after 90 days |

## tRPC router

All mutations require org owner/admin role.

| Procedure | Type | Description |
|-----------|------|-------------|
| `apiKeys.list` | query | List keys for active org (never returns hash) |
| `apiKeys.create` | mutation | Create key, returns plaintext once |
| `apiKeys.revoke` | mutation | Immediately revoke a key |
| `apiKeys.roll` | mutation | Rotate key with grace period |
| `apiKeys.rename` | mutation | Change key name |
| `apiKeys.updateScopes` | mutation | Change scopes on active key |
| `apiKeys.getScopes` | query | List all registered scopes |
| `apiKeys.getKeyStats` | query | Usage stats (24h / 7d / 30d) |
| `apiKeys.adminGetLogs` | query | Paginated request logs (admin) |
| `apiKeys.adminListKeys` | query | All keys across orgs (admin) |

## Project files

Scaffolded by `bun run indigo add core-api`:

| File | Purpose |
|------|---------|
| `src/config/deps/api-deps.ts` | Dependency wiring + project scope registration |
| `src/app/dashboard/(panel)/settings/api-keys/page.tsx` | Admin key management page |
| `src/app/(public)/account/api/page.tsx` | Customer-facing key management |
| `src/app/api/v2/projects/route.ts` | Example: list/create projects (org-scoped) |
| `src/app/api/v2/projects/[id]/route.ts` | Example: get project by ID (org-scoped) |
