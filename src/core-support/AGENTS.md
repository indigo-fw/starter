# core-support — AGENTS.md

AI-powered support chat widget + ticket system with escalation.

**Project owns:** Admin pages, `SupportChatWidgetWrapper`, account support pages, `config/deps/support-deps.ts`.

## DI (`setSupportDeps()`)

`createTicketFromChat`, `resolveOrgId`, `sendNotification` / `sendOrgNotification`, `broadcastEvent`, `lookupUsers`, `callAI`, `enqueueTemplateEmail`, `getSupportEmail`.

## Wiring

1. Create `config/deps/support-deps.ts` → import in `server.ts`
2. Routers auto-registered via `indigo:sync`
3. Use `SupportChatWidget` in public layout
4. Override defaults via `setChatConfig()`
5. Email templates `support-ticket-new` / `-reply` (staff) and `-answer` (customer) install to `emails/en/`; names live in `@/server/jobs/email` `TEMPLATE_NAMES`. Set the staff inbox in admin → Settings → Company (`company.support_email`) — `getSupportEmail()` returning `null` disables staff emails only, in-app notifications still fire.

## Invariants

- Ticket events notify **staff** (users whose role grants `section.settings`), never the customer's org — org admins are usually the customer.
- One email per event (`lib/email-notifications.ts`); no throttling here (separate backlog item). Helpers never throw — a mail outage must not fail the ticket mutation.
- Customer email goes out in `user.lang` (unknown → default locale) with a locale-prefixed `/account/support/<id>` link; staff links are locale-free `/dashboard/...`.
- Own-ticket procedures (`list`/`get`/`create`/`reply`/`close`) use `appealProcedure` so a banned user can contest the ban. Caps make that safe: `create` 10/hour per user (`rl:support:create:<userId>`, fail-open), banned → one open ticket, `reply` ≤ `UNANSWERED_REPLY_LIMIT` (8) customer messages since the last staff reply. All reject with `TOO_MANY_REQUESTS`.
