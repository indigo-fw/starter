# core-chat — CLAUDE.md

AI character chat module — text, image, video generation, voice calls. DB-stored providers with encryption, round-robin, fallback.

## Module Boundary

**core-chat owns:** 10 schema tables, 9 tRPC routers, provider system (5 adapter types: LLM/image/video/TTS/STT), image orchestration pipeline, voice call system, content moderation, BullMQ workers, 20+ UI components.

**Project owns:** Admin pages, chat/character pages, `config/chat-deps.ts`, schema overrides.

## Import Rules

- Imports from `@/core/*`, framework conventions (`@/server/trpc`, `@/server/db`)
- Cross-module deps via `setChatDeps()` (subscriptions, tokens)
- WS + channel auth registered via hooks in chat-deps.ts

## Schema Tables

| Table | Purpose |
|---|---|
| `chat_characters` | AI personas with trait IDs, featured media FKs |
| `chat_conversations` | User conversations with trait overrides, read tracking |
| `chat_messages` | Messages (user/assistant/voice/system/call events) |
| `chat_conversation_summaries` | LLM-generated summaries to manage context windows |
| `chat_media` | Images, videos, avatars (contentHash, NSFW flag) |
| `chat_providers` | DB-stored AI providers with encrypted credentials |
| `chat_provider_logs` | Per-request health logging |
| `chat_reports` | User-submitted message reports |
| `chat_audit_log` | Moderation events for auto-blocking |
| `chat_voice_calls` | Voice call billing records |
| `chat_user_preferences` | User chat preferences (overridable by project) |

## Provider System

- 5 types: `llm`, `image`, `video`, `tts`, `stt` (+ mock adapters for all)
- AES-256-GCM encrypted credentials via `ENCRYPTION_KEY` (64-char hex)
- Round-robin selection, 5-min cooldown on errors, retry with next (3 attempts LLM/image, 2 video, 1 TTS/STT)
- 4xx = rethrow immediately (bad input). Streaming: no retry mid-stream
- `MOCK_AI=true` seeds mock providers, no API keys needed

## Image Pipeline

`initImagePipeline()` in chat-deps.ts: extractKeywords → findAllMatches (O(1) index + fuzzy) → selectBestTraits → completeCoverage → applyRenderFilter → detectNsfw → buildImagePrompt → generateImage

## Voice Calls

WebSocket JSON control + base64 audio. Flow: mic (16kHz) → STT → save → LLM stream → sentence split → TTS → stream back. Pre-pay per minute, auto-end on insufficient tokens or 2min idle. Barge-in via AbortController.

## Token Model

Pre-pay + refund: deduct BEFORE dispatch, refund on ANY failure via `deps.addTokens()`.

## WebSocket Events

Channel: `chat:<conversationId>` — authorized via `registerChannelAuthorizer()`

| Event | When |
|---|---|
| `MSG_CONFIRMED` | User message accepted |
| `MSG_STATUS` | Status change (moderated, failed) + censorType |
| `MSG_STREAM_START/CHUNK/END` | LLM text streaming |
| `MSG_IMAGE_PROCESSING/COMPLETE` | Image generation (includes isNsfw) |
| `MSG_VIDEO_PROCESSING/COMPLETE` | Video generation |
| `CONV_STATUS` | Conversation status change |
| `BALANCE_UPDATE` | Token balance changed |
| `VOICE_CALL_AUDIO` | Voice call audio chunk (base64) |
| `VOICE_CALL_PARTIAL_TRANSCRIPTION` | Real-time caption |
| `VOICE_CALL_COMPLETED/ENDED/BILLING/FORCE_END` | Voice call lifecycle |

## Key Patterns

- Optimistic UUID inserts (client-generated, `ON CONFLICT DO NOTHING`)
- Conversation hash: same user + character = reuse conversation
- Media dedup: MD5 of keywords + characterId
- Audit + auto-block after 10 violations in 24h (`AUTO_BLOCK_THRESHOLD`)
- Language auto-detection: DeepL detect at message count 6 (3rd user+assistant exchange)
- Schema override system for `chat_user_preferences` (see `src/schema/overrides/CLAUDE.md`)

## Env Variables

| Variable | Required | Purpose |
|---|---|---|
| `ENCRYPTION_KEY` | For providers | 64-char hex, AES-256-GCM |
| `MOCK_AI` | No | `true` = mock adapters |
| `AI_API_KEY` | For default LLM | Seeds default LLM provider |
| `AI_API_URL` | No | Override OpenAI-compatible endpoint |
| `AI_MODEL` | No | Default: `gpt-4o-mini` |
| `ELEVENLABS_API_KEY` | For voice | TTS + STT |
