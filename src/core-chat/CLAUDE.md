# core-chat — CLAUDE.md

AI character chat module with text, image, video generation, and voice calls. DB-stored providers with encryption, round-robin, fallback. Full image prompt orchestration pipeline. Content moderation with audit logging. Schema override system for project extensibility.

## Module Boundary

**core-chat owns:** 10 schema tables (characters, conversations, messages, media, providers, provider-logs, reports, audit, voice-calls, user-preferences). 9 tRPC routers (characters, conversations, messages, chat-public, providers, chat-admin, media, task-queue, voice). Provider system (5 adapter types: LLM, image, video, TTS, STT + mock adapters). Image orchestration pipeline (visual enums 6875 lines, normalizer, enum-index, trait-selector, prompt-builder, NSFW detector, presets). Voice call system (call handler, orchestrator, billing, audio utils). Content moderation (keywords + audit + auto-block). System prompt enrichment. Conversation engine. BullMQ workers (AI response, summarization, cleanup, video optimization). UI components (20+). Personality greetings (13 personalities × 10 each). Character browse page with filters.

**Project owns:** Admin pages (`/dashboard/settings/chat/`), chat pages (`/chat/`, `/characters/`), dependency wiring (`config/chat-deps.ts`), schema overrides (`src/schema/overrides/`).

## Import Rules

- core-chat imports from `@/core/*` (utilities, storage, webhooks, module-hooks)
- Framework: `@/server/trpc`, `@/server/db`, `@/server/db/schema/auth`
- Cross-module: none (uses deps injection for subscriptions via `setChatDeps()`)
- WS handlers: registered via `registerHook('ws.message', ...)` in chat-deps.ts
- Channel auth: registered via `registerChannelAuthorizer()` in chat-deps.ts

## Schema Tables

| Table | Purpose |
|---|---|
| `chat_characters` | AI personas with enum trait IDs, featured media FKs |
| `chat_conversations` | User conversations with trait overrides, read tracking, language |
| `chat_messages` | Messages (user/assistant/voice/system/call events) |
| `chat_media` | Images, videos, avatars (with contentHash, NSFW flag, optimization status) |
| `chat_providers` | DB-stored AI providers with encrypted credentials |
| `chat_provider_logs` | Per-request health logging |
| `chat_reports` | User-submitted message reports |
| `chat_audit_log` | Moderation events for auto-blocking |
| `chat_voice_calls` | Voice call billing records |
| `chat_user_preferences` | User chat preferences (overridable by project) |

## Provider System

- **5 provider types:** `llm`, `image`, `video`, `tts`, `stt`
- **Adapter registry:** `openai`, `dall-e`, `falai`, `elevenlabs`, `mock` (all 5 types)
- **Credentials:** AES-256-GCM encrypted via `ENCRYPTION_KEY` env var
- **Selection:** round-robin among active providers sorted by priority
- **Fallback:** 5-min cooldown on 5xx/network errors, retry with next (max 3 for LLM/image, 2 for video)
- **4xx errors:** rethrow immediately, no cooldown (bad input, not provider's fault)
- **Streaming safety:** once chunks yielded, mid-stream failure propagates (no retry with garbled text)
- **maxConcurrent:** enforced per provider via in-memory active count
- **Health logging:** fire-and-forget inserts to `chat_provider_logs`
- **Mock mode:** `MOCK_AI=true` — seeds mock providers for all 5 types, no API keys needed

## Image Generation Pipeline

Initialized at startup via `initImagePipeline()` in chat-deps.ts:
1. `extractKeywords()` — 13-step normalizer with 110 phrase synonyms + 247 word synonyms
2. `findAllMatches()` — O(1) keyword index + fuzzy fallback (Levenshtein 0.8 cutoff)
3. `selectBestTraits()` — score-based selection with tolerance window
4. `completeCoverage()` — context-tag-driven outfit/location gap filling
5. `applyRenderFilter()` — TOPLESS/BDSM/UNDERBOOB special handling
6. `detectNsfw()` — 70+ NSFW keywords
7. `buildImagePrompt()` — score tags, rating, gender, ethnicity, hair, skin, outfits, colors, LoRA, negative
8. `generateImage()` via ProviderManager → adapter

## Voice Call System

- **Protocol:** WebSocket JSON control + base64 audio
- **Flow:** mic capture (16kHz) → STT → save message → LLM stream → sentence split → TTS → stream audio back
- **Billing:** pre-pay per minute, auto-end on insufficient tokens or 2min idle
- **State machine:** IDLE → GREETING → ACTIVE → ENDED
- **Barge-in:** AbortController propagates through LLM + TTS
- **System prompt:** voice variant (1-2 sentences, no emojis/markdown, spoken style)
- **Message types:** `user_voice`, `assistant_voice`, `call_start`, `call_end`

## Token Model

Pre-pay + refund:
1. Deduct tokens BEFORE AI dispatch
2. On success: consumed (no action)
3. On ANY failure: refund via `deps.addTokens()`

## WebSocket Events

Channel: `chat:<conversationId>` — authorized via `registerChannelAuthorizer()`

| Event | When |
|---|---|
| `msg_confirmed` | User message accepted |
| `msg_status` | Status change (moderated, failed) + censorType |
| `msg_stream_start/chunk/end` | LLM text streaming |
| `msg_image_processing/complete` | Image generation (includes isNsfw) |
| `msg_video_processing/complete` | Video generation |
| `balance_update` | Token balance changed |
| `voice_call_audio` | Voice call audio chunk (base64) |
| `voice_call_partial_transcription` | Real-time caption |
| `voice_call_completed/ended/billing/force_end` | Voice call lifecycle |

## Schema Override System

Modules can declare tables as overridable. Projects extend by dropping a file in `src/schema/overrides/`:

```typescript
// Module defines columns + default table:
export const chatUserPreferenceColumns = { userId, preferredName, preferredGender, ... };
export const chatUserPreferences = pgTable('chat_user_preferences', chatUserPreferenceColumns);

// Project overrides at src/schema/overrides/chat-user-preferences.ts:
import { chatUserPreferenceColumns } from '@/core-chat/schema/user-preferences';
export const chatUserPreferences = pgTable('chat_user_preferences', {
  ...chatUserPreferenceColumns,
  favoriteColor: varchar('favorite_color', { length: 50 }),
});
```

Run `bun run indigo:sync` — generated/module-schema.ts auto-detects and uses the override.

## Key Patterns

- **Optimistic UUID inserts:** client generates ID, adds immediately, server uses ON CONFLICT DO NOTHING
- **Conversation trait overrides:** per-conversation traits override character defaults in system prompt
- **Personality greetings:** 13 personalities × 10 greetings with `%%%username%%%` interpolation
- **Conversation hash:** order-independent dedup — same user + character = reuse conversation
- **Media dedup:** MD5 of keywords + characterId avoids regenerating identical images
- **Audit + auto-block:** moderation events tracked, auto-block after 10 violations in 24h
- **Video optimization:** ffmpeg 2-pass x264 encoding queued after generation
- **Language auto-detection:** DeepL detect on 3rd user message, stores lang + timestamp
- **i18n:** all public components use `useBlankTranslations()`
- **Accessibility:** ARIA roles on chat log, messages, input; keyboard nav in conversation list

## Env Variables

| Variable | Required | Purpose |
|---|---|---|
| `ENCRYPTION_KEY` | For providers | 64-char hex, AES-256-GCM key for provider credentials |
| `MOCK_AI` | No | `true` = use mock adapters (no API keys needed) |
| `AI_API_KEY` | For default LLM | Seed creates a default LLM provider from this |
| `AI_API_URL` | No | Override OpenAI-compatible endpoint |
| `AI_MODEL` | No | Default: `gpt-4o-mini` |
| `ELEVENLABS_API_KEY` | For voice | TTS + STT via ElevenLabs |
| `DEEPL_API_KEY` | No | Translation + language detection |

## Configuration (Options Registry)

Admin-editable via `/dashboard/settings` (group: "Chat & AI"):
- `chat.moderation.enabled/action/keywords`
- `chat.tokens.text_message/image_generation/video_generation/voice_call_per_minute`
- `chat.rate_limit.*` (anonymous per-conv/lifetime, registered window/messages)
