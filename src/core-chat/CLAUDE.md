# core-chat — CLAUDE.md

AI character chat module with text, image, and video generation. DB-stored providers with encryption, round-robin selection, and fallback. Full image prompt orchestration pipeline with visual enums, keyword matching, NSFW detection, and model presets.

## Module Boundary

**core-chat owns:** Character + conversation + message + media + provider + provider-log schemas. Character/conversation/message/media/provider/admin tRPC routers. AI provider system (adapters, registry, manager). Image prompt pipeline (enums, normalizer, trait selector, prompt builder, presets, NSFW detector). Content moderation (keyword filter + external hook). System prompt enrichment. Conversation engine (text streaming, image gen, video gen via WS). BullMQ workers (AI response, summarization, cleanup). Chat UI components.

**Project owns:** Admin pages (`/dashboard/settings/chat/`), chat pages (`/chat/`), dependency wiring (`config/chat-deps.ts`), moderation keyword config (via options registry).

## Import Rules

- core-chat imports from `@/core/*` (core utilities, storage, webhooks)
- Framework: `@/server/trpc`, `@/server/db`, `@/server/db/schema/auth`
- Cross-module: none (uses deps injection for subscriptions)
- Project-specific behavior via `setChatDeps()`

## Provider System

### Architecture
- **Providers stored in DB** (`chat_providers`), credentials AES-256-GCM encrypted with `ENCRYPTION_KEY`
- **3 provider types:** `llm`, `image`, `video`
- **Adapter registry:** maps adapter names to classes. Built-in: `openai`, `dall-e`, `falai`, `mock`
- **Round-robin selection** among active providers sorted by priority
- **Fallback:** 5-min cooldown on failure, retry with next provider (max 3 attempts for LLM/image, 2 for video)
- **4xx errors** (`ProviderClientError`): rethrow immediately, no cooldown, no retry
- **maxConcurrent enforced** per provider via in-memory active count
- **Health logging:** fire-and-forget inserts to `chat_provider_logs`
- **Streaming safety:** once chunks are yielded, mid-stream failure propagates (no retry with garbled text)

### Mock mode
Set `MOCK_AI=true` in .env. Seed creates mock providers for all 3 types. No API keys needed.

### Env fallback
If no DB providers exist and `AI_API_KEY` is set, the seed creates a default LLM provider from env.

## Image Generation Pipeline

Full port from sai_flirtcam:
1. **Message type detection** (`detect-message-type.ts`): regex matching for image/video requests
2. **Keyword extraction** (`image/normalizer.ts`): 13-step pipeline with synonyms, stop words, color+item pairs
3. **Enum matching** (`image/enum-index.ts`): O(1) keyword lookup + fuzzy fallback (Levenshtein)
4. **Trait selection** (`image/trait-selector.ts`): coverage completion, context tags, render filter
5. **NSFW detection** (`image/nsfw-detector.ts`): tags + keywords + custom text
6. **Prompt building** (`image/prompt-builder.ts`): score tags, rating, traits, colors, LoRA, negative prompts
7. **Model presets** (`image/presets/`): generation config (steps, CFG, sampler, resolution)

## Token Model

Pre-pay + refund:
1. Deduct tokens BEFORE AI dispatch
2. On success: tokens consumed
3. On ANY failure: refund via `addTokens()`

## WebSocket Events

Channel: `chat:<conversationId>` (owner or staff)

| Event | When |
|---|---|
| `msg_confirmed` | User message accepted |
| `msg_status` | Status change (moderated, failed) |
| `msg_stream_start` | LLM generation started (show typing) |
| `msg_stream_chunk` | Text chunk (assemble streaming) |
| `msg_stream_end` | LLM done |
| `msg_image_processing` | Image generation started (show typing) |
| `msg_image_complete` | Image done (mediaUrl, dimensions) |
| `msg_video_processing` | Video generation started |
| `msg_video_complete` | Video done (mediaUrl) |

## Key Patterns

- **Optimistic inserts**: Client generates UUID, adds immediately, server uses ON CONFLICT DO NOTHING
- **Streaming safety**: 60s timeout on client if response stalls
- **Moderation**: Keywords from options DB (admin-editable) + optional external hook via deps
- **i18n**: All public components use `useBlankTranslations()`
- **Accessibility**: ARIA roles on chat log, messages, input. Keyboard nav in conversation list.
