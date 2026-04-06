# Contributing to Indigo

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

1. Fork and clone the repo
2. Install dependencies: `bun install`
3. Start services: `docker compose up -d`
4. Copy env: `cp .env.example .env`
5. Initialize DB: `bun run init`
6. Start dev server: `bun run dev`

## Making Changes

1. Create a branch from `main`: `git checkout -b feat/my-feature`
2. Make your changes
3. Run type check: `bun run typecheck`
4. Test your changes locally
5. Commit with a descriptive message
6. Push and open a pull request

## Code Style

- **TypeScript** — no `any`, use `unknown` and narrow
- **Zod** — constrain all inputs (`.max()` on strings, `.uuid()` on IDs)
- **tRPC** — use the correct procedure level (`publicProcedure`, `protectedProcedure`, `sectionProcedure`)
- **CSS** — use admin CSS classes (`.admin-card`, `.admin-btn`, etc.) instead of inline Tailwind in the admin panel
- **Translations** — wrap all admin UI text in `__()` using `useBlankTranslations()`
- **Utilities** — use shared helpers (`ensureSlugUnique`, `buildStatusCounts`, `parsePagination`, `updateWithRevision`) instead of inlining logic
- **Slugs** — use `slugify()` / `slugifyFilename()` from `@/lib/slug`
- **Email** — use `enqueueEmail()`, never call `sendEmail()` directly

See `CLAUDE.md` for the full coding standards and architecture guide.

## Adding a Content Type

Indigo is config-driven. To add a new content type:

1. Add config entry in `src/config/cms.ts`
2. For post-backed types: auto-registered via `cms_posts.type`. For others: create schema table + router
3. Add admin section page under `dashboard/cms/`
4. Add sitemap entries in `src/app/sitemap.ts`

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a description of what changed and why
- Ensure `bun run typecheck` passes with zero errors
- Update `CLAUDE.md` if you change architecture, add routers, or modify conventions

## Reporting Issues

Use GitHub Issues. Include:

- Steps to reproduce
- Expected vs actual behavior
- Node/Bun version, OS
- Relevant error messages or logs

## License & CLA

Indigo is dual-licensed under [AGPL-3.0](LICENSE) and a [commercial license](COMMERCIAL-LICENSE.md).

By submitting a pull request, you agree to the [Contributor License Agreement (CLA)](CLA.md). This grants the project maintainers the right to include your contributions in both the open-source and commercially licensed versions of Indigo. Your Git commit metadata (name and email) serves as your electronic signature.
