# core-ai-writer — CLAUDE.md

Paid module. AI-powered content generation, SEO optimization, translation, and image alt text.

## Module Boundary

**core-ai-writer owns:** AI writer router, AI client lib, system prompts.

**Project owns:** Nothing — this module has no project-layer files, no schema, no admin pages. It adds tRPC procedures that the editor UI calls.

## Import Rules

- Imports from `@/server/trpc` (framework convention)
- Imports from `@/core/lib/infra/logger` (core utility)
- Imports from `@/lib/env` (dynamic, for AI_API_KEY)
- No deps.ts needed — no project-specific behavior to inject
- Project imports from `@/core-ai-writer/*`

## Procedures

| Procedure | What it does |
|-----------|-------------|
| `aiWriter.generatePost` | Full blog post from topic/outline (returns HTML) |
| `aiWriter.generateOutline` | Structured outline with sections and key points |
| `aiWriter.generateSeo` | Meta title, description, keywords from content |
| `aiWriter.analyzeSeo` | SEO score + issues + fixes for existing content |
| `aiWriter.translate` | AI translation preserving HTML + shortcodes |
| `aiWriter.generateAltText` | Image alt text via vision API |

## Wiring Into a Project

1. Add to `indigo.config.ts` and run `bun run indigo:sync`
2. That's it — no deps, no schema, no admin pages needed

## AI Provider Requirements

Uses the same `AI_API_KEY` / `AI_API_URL` / `AI_MODEL` env vars as the core editor AI.
Vision features (alt text) require a model that supports image inputs (GPT-4o, Claude, etc.).
