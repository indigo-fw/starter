# core-chat -- CLAUDE.md

AI character chat module. Text-based conversations with configurable AI personas. Requires core-subscriptions for token billing.

## Module Boundary

**core-chat owns:** Character schema + CRUD, conversation/message schema, chat/message routers, AI provider (OpenAI-compatible), content moderation (keyword + external hook), conversation engine (streaming via WS), summarization + cleanup jobs, chat UI components, config/deps interfaces.

**Project owns:** Admin pages (`/dashboard/settings/chat/`), chat pages (`/chat/`), dependency wiring (`config/chat-deps.ts`).

## Import Rules

- core-chat imports from `@/core/*` (core utilities)
- Framework conventions imported directly: `@/server/trpc`, `@/server/db`, `@/server/db/schema/auth`
- Cross-module: none (uses deps injection for subscriptions)
- Project-specific behavior injected via `setChatDeps()`
- Project imports from `@/core-chat/*`
- Core (`src/core/`) never imports from core-chat

## Dependency Injection

`deps.ts` defines `ChatDeps`. Injected deps:

- **resolveOrgId** — resolve active org for billing
- **deductTokens** — atomic token deduction (post AI response)
- **getTokenBalance** — pre-flight balance check
- **requireFeature** — plan feature gate (`aiChat`)
- **broadcastEvent / sendToUser** — WS broadcasting
- **sendNotification** — fire-and-forget notification
- **externalModerate** — optional external content moderation

## Key Patterns

- **Optimistic inserts**: Client generates UUID for user messages, inserts immediately. Server uses `ON CONFLICT DO NOTHING` for idempotency
- **Streaming**: AI responses streamed via WebSocket (`msg_stream_start`, `msg_stream_chunk`, `msg_stream_end`)
- **Moderation**: Keyword filter (sync) + optional external hook (async). Runs before AI dispatch
- **Token deduction**: Pre-flight check before dispatch, atomic deduct after successful AI response
- **Summarization**: Background job compresses old messages into summaries for LLM context
- **WS channel**: `chat:<conversationId>` — conversation owner or staff

## Configuration

`setChatConfig()` in config/chat-deps.ts to override defaults:
- `tokenCostPerMessage` (default: 1)
- `maxConversationsPerUser` (default: 50)
- `summaryThreshold` (default: 100 messages)
- `contextMessageLimit` (default: 40 recent messages)
- `rateLimitMessages` / `rateLimitWindowSeconds`
- `moderationKeywords` / `moderationAction`
- `featureKey` (default: 'aiChat')
