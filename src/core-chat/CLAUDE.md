# core-chat — CLAUDE.md

AI character chat module — text, image, video generation, voice calls. DB-stored providers with encryption, round-robin, fallback.

**Project owns:** Admin pages, chat/character pages, `config/deps/chat-deps.ts`, schema overrides.

## DI

`setChatDeps()` — subscriptions, tokens. WS + channel auth registered via hooks in `chat-deps.ts`.

## Schema

Non-obvious: `chat_conversation_summaries` are LLM-generated to manage context windows; `chat_audit_log` feeds moderation auto-blocking; `chat_user_preferences` is project-overridable via the schema override system.

## Provider System

- 5 types: `llm`, `image`, `video`, `tts`, `stt` (+ mock adapters for all)
- AES-256-GCM encrypted credentials via `ENCRYPTION_KEY` (64-char hex)
- Round-robin selection, 5-min cooldown on errors, retry with next (3 attempts LLM/image, 2 video, 1 TTS/STT)
- 4xx = rethrow immediately (bad input). Streaming: no retry mid-stream

## Image Pipeline

`initImagePipeline()` in chat-deps.ts: extractKeywords → findAllMatches (O(1) index + fuzzy) → selectBestTraits → completeCoverage → applyRenderFilter → detectNsfw → buildImagePrompt → generateImage

## Voice Calls

WebSocket JSON control + base64 audio. Flow: mic (16kHz) → STT → save → LLM stream → sentence split → TTS → stream back. Pre-pay per minute, auto-end on insufficient tokens or 2min idle. Barge-in via AbortController.

## Token Model

Pre-pay + refund: deduct BEFORE dispatch, refund on ANY failure via `deps.addTokens()`.

## WebSocket Events

Channel: `chat:<conversationId>` — must be authorized via `registerChannelAuthorizer()` in chat-deps.ts. Live event list: `lib/types.ts` (event name constants; emit sites in `routers/messages.ts`, `lib/voice/call-handler.ts`). Non-obvious: `MSG_STATUS` carries `censorType` on moderation; `MSG_IMAGE_COMPLETE` includes `isNsfw`.

## Key Patterns

- Optimistic UUID inserts (client-generated, `ON CONFLICT DO NOTHING`)
- Conversation hash: same user + character = reuse conversation
- Media dedup: MD5 of keywords + characterId
- Audit + auto-block after 10 violations in 24h (`AUTO_BLOCK_THRESHOLD`)
- Language auto-detection: DeepL detect at message count 6 (3rd user+assistant exchange)
- Schema override system for `chat_user_preferences` (see `src/schema/overrides/CLAUDE.md`)

## Env Variables

Full list: `src/lib/env.ts`. Module-specific requirements:

- `ENCRYPTION_KEY` — 64-char hex, AES-256-GCM; required for DB-stored providers
- `AI_API_KEY` / `AI_API_URL` / `AI_MODEL` — seeds default LLM provider (default model `gpt-4o-mini`)
- `ELEVENLABS_API_KEY` — required for voice (TTS + STT)
- `MOCK_AI=true` — seeds mock providers for all 5 types, no keys needed
