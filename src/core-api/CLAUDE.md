# core-api — CLAUDE.md

Org-scoped REST API with key management, scopes, rate limiting, and usage metering.

## Module Boundary

**core-api owns:** API key schema (2 tables), key service, scope registry, v2 route wrapper, api-keys router, `ApiKeyManager` UI, maintenance tasks.

**Project owns:** v2 REST endpoints (`app/api/v2/`), admin/account pages, `config/deps/api-deps.ts`, project-specific scope registration.

## DI (`setApiDeps()`)

`resolveOrgId`, `deductApiCallToken` (optional metering via core-subscriptions).

## Key Statuses

`active` → `expiring` (rolled, still works until `expiresAt`) → `expired` (maintenance task) / `revoked` (immediate, permanent).

## Scope System

Extensible registry via `registerApiScopes([{ id, label, module }])`. Core registers CMS scopes. `null` scopes = superkey. `[]` = no access.

## v1 vs v2

- **v1** (`/api/v1/`): global API key, read-only CMS, free (stays in core)
- **v2** (`/api/v2/`): org-scoped Bearer auth, scope-checked, rate-limited, metered (requires this module)

## Wiring

1. Create `config/deps/api-deps.ts` with `setApiDeps()` + `registerApiScopes()`
2. Create v2 routes using `withApiV2Route()`
3. Other modules register scopes in their `serverInit`
