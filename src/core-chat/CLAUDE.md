# core-chat — CLAUDE.md

AI character chat module — text, image, video generation, voice calls. DB-stored providers with encryption, round-robin, fallback.

## Module Boundary

**core-chat owns:** 10 schema tables, 9 tRPC routers, provider system (5 adapter types: LLM/image/video/TTS/STT), image orchestration pipeline, voice call system, content moderation, BullMQ workers, 20+ UI components.

**Project owns:** Admin pages, chat/character pages, `config/chat-deps.ts`, schema overrides.

## Import Rules

- Imports from `@/core/*`, framework conventions (`@/server/trpc`, `@/server/db`)
- Cross-module deps via `setChatDeps()` (subscriptions, tokens)
- WS + channel auth registered via hooks in chat-deps.ts

## Provider System

- 5 types: `llm`, `image`, `video`, `tts`, `stt` (+ mock adapters for all)
- AES-256-GCM encrypted credentials via `ENCRYPTION_KEY`
- Round-robin selection, 5-min cooldown on 5xx, retry with next (max 3 LLM/image, 2 video)
- 4xx = rethrow immediately (bad input). Streaming: no retry mid-stream
- `MOCK_AI=true` seeds mock providers, no API keys needed

## Image Pipeline

`initImagePipeline()` in chat-deps.ts: extractKeywords → findAllMatches (O(1) index + fuzzy) → selectBestTraits → completeCoverage → applyRenderFilter → detectNsfw → buildImagePrompt → generateImage

## Voice Calls

WebSocket JSON control + base64 audio. Flow: mic (16kHz) → STT → save → LLM stream → sentence split → TTS → stream back. Pre-pay per minute, auto-end on insufficient tokens or 2min idle. Barge-in via AbortController.

## Token Model

Pre-pay + refund: deduct BEFORE dispatch, refund on ANY failure via `deps.addTokens()`.

## Key Patterns

- Optimistic UUID inserts (client-generated, `ON CONFLICT DO NOTHING`)
- Conversation hash: same user + character = reuse conversation
- Media dedup: MD5 of keywords + characterId
- Audit + auto-block after 10 violations in 24h
- Language auto-detection via DeepL on 3rd message
- Schema override system for `chat_user_preferences` (see `src/schema/overrides/CLAUDE.md`)

## Env Variables

| Variable | Required | Purpose |
|---|---|---|
| `ENCRYPTION_KEY` | For providers | 64-char hex, AES-256-GCM |
| `MOCK_AI` | No | `true` = mock adapters |
| `AI_API_KEY` | For default LLM | Seeds default LLM provider |
| `ELEVENLABS_API_KEY` | For voice | TTS + STT |
