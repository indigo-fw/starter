# CLAUDE.dev.md — Framework maintainer context

This file is excluded from `bunx degit` installs via `.degitignore`.
For codebase instructions (commands, standards, architecture) see `CLAUDE.md`.
For workspace-level context (folder structure, demo, site) see `E:\projects\indigo\CLAUDE.md`.

## Repo roles

The same repo is both the distributed starter and the framework dev tree — behavior is keyed off git config, not files.

- **Customer install:** `bunx degit indigo-fw/starter my-app` — no `.git` ships, `bun run init` creates a fresh repo
- **Framework dev:** `git clone` + `git config --local indigo.role framework` set once. This protects the repo from `ensureGitRepo()` and unlocks `bun run indigo push`. Also unlocked by `INDIGO_MAINTAINER=1`
- **Module updates** (`indigo add` / `update`): use `git subtree … --squash` — needs no shared ancestry, works in degit'd repos
- **`indigo push`**: needs real split history, framework role only

## db:generate — maintainer note

`db:generate` is a **maintainer step, not a downstream-install step**. It diffs the schema against `drizzle/meta/*` snapshots and on a column rename/conflict opens an interactive TUI prompt that requires a real TTY (errors in CI/piped shells). Downstream apps only ever `db:migrate`. If you hand-write a migration, also append its entry to `drizzle/meta/_journal.json` (a placeholder `NNNN_snapshot.json` keeps `migrate` happy; regenerate the canonical one with `db:generate` later).

## .degitignore — what's excluded from customer installs

```
todos/
CLAUDE.dev.md
.github/workflows/bootstrap-demo.yml
.github/workflows/apply-cloudflare-rules.yml
.github/workflows/deploy-demo.yml
```

## Demo deployment

- VPS: Hetzner CX22, demo.indigo-fw.dev
- Deploy: `.github/workflows/deploy-demo.yml` — triggers on push to main, builds Docker image, pulls on VPS
- Bootstrap: `.github/workflows/bootstrap-demo.yml` — one-shot, seeds DB, installs hourly reset cron
- Reset cron: runs `bun run init -- -y --reset` every hour at :00, logs to `/var/log/indigo-reset.log`
- Credentials shown on login page via `INIT_ADMIN_EMAIL` / `INIT_ADMIN_PASSWORD` env vars
- `INDIGO_ROBOTS_PROFILE=demo` — enables demo robots.txt profile and login banner label
- `BETTER_AUTH_URL` — must be set to `https://demo.indigo-fw.dev` (not baked at build time unlike NEXT_PUBLIC_APP_URL)

## Key architectural decisions

- `NEXT_PUBLIC_APP_URL` is baked at build time by Next.js webpack. Never use it in server-side code that needs the runtime domain (robots.ts, sitemap.ts, RSS feeds, auth). Use `getServerAppUrl()` from `src/lib/app-url.ts` instead — it prefers `BETTER_AUTH_URL` at runtime.
- `auth-client.ts` has no `baseURL` — Better Auth defaults to same origin, avoids localhost:3000 in pre-built images
