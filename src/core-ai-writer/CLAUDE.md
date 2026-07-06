# core-ai-writer — CLAUDE.md

Paid module. AI-powered content generation, SEO optimization, translation, and image alt text.

**Project owns:** Nothing — no project-layer files, no schema, no admin pages, no deps.ts. The module only adds tRPC procedures the editor UI calls.

## Procedures

Non-obvious: `generatePost` returns HTML (not markdown); `translate` preserves HTML tags + shortcodes; `generateAltText` requires a vision-capable model.

## Wiring

Add to `indigo.config.ts` + `bun run indigo:sync` — that's the whole install.

## AI Provider Requirements

Uses the same `AI_API_KEY` / `AI_API_URL` / `AI_MODEL` env vars as the core editor AI.
Vision features (alt text) require a model that supports image inputs (GPT-4o, Claude, etc.).
