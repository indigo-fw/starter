# core-support — CLAUDE.md

AI-powered support chat widget + ticket system with escalation.

## Module Boundary

**core-support owns:** SupportChatWidget, chat session/message schema, ticket schema, support-chat + support routers, cleanup job.

**Project owns:** Admin pages, `SupportChatWidgetWrapper`, account support pages, `config/support-deps.ts`.

## DI (`setSupportDeps()`)

`createTicketFromChat`, `resolveOrgId`, `sendNotification` / `sendOrgNotification`, `broadcastEvent`, `lookupUsers`, `callAI`.

## Wiring

1. Create `config/support-deps.ts` → import in `server.ts`
2. Routers auto-registered via `indigo:sync`
3. Use `SupportChatWidget` in public layout
4. Override defaults via `setChatConfig()`
