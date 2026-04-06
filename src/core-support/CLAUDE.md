# core-support — CLAUDE.md

Paid module. AI-powered support chat widget + ticket system with escalation.

## Module Boundary

**core-support owns:** SupportChatWidget component, chat session/message schema, ticket/ticket-message schema, support-chat + support (tickets) tRPC routers, chat cleanup job, default config, dependency interface.

**Project owns:** admin pages (`/dashboard/settings/support/`), `SupportChatWidgetWrapper`, account support pages, dependency wiring (`config/support-deps.ts`).

## Import Rules

- core-support imports from `@/core/*` (core utilities)
- Framework conventions imported directly: `@/server/trpc`, `@/server/db`, `@/server/db/schema/auth`, `@/server/db/schema/organization`, `@/server/lib/ws`
- Project-specific behavior injected via `setSupportDeps()`
- Project imports from `@/core-support/*`
- Core (`src/core/`) never imports from core-support

## Dependency Injection

`deps.ts` defines `SupportDeps`. Injected deps:

- **createTicketFromChat** — escalation creates a ticket (or null)
- **resolveOrgId** — resolve active org for a user
- **sendNotification / sendOrgNotification** — notify users/org members
- **broadcastEvent** — WS broadcast to a channel
- **lookupUsers** — resolve user IDs to {id, name, email}
- **callAI** — AI provider (project chooses model/provider)

## Wiring Into a Project

1. **Deps:** Create `config/support-deps.ts` calling `setSupportDeps()`, import in `server.ts`
2. **Routers:** Import `supportChatRouter` + `supportRouter` in `_app.ts`
3. **Schema:** Re-export tables from `schema/index.ts`
4. **Job:** Import `startSupportChatCleanupWorker` in `server.ts`
5. **Widget:** Use `SupportChatWidget` in public layout
6. **Config:** Override defaults via `setChatConfig()`
