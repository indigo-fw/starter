---
name: setup
description: First-time setup of this Indigo app as a conversation — gather the user's choices in chat, then run init non-interactively. Use when the user asks to set up, initialize, or install this project, or right after a fresh degit.
---

# Conversational setup

You are setting this Indigo app up for the user. Never leave a CLI prompt waiting for keyboard input — gather every answer in chat first, then run commands with flags. Use the AskUserQuestion tool when available; otherwise ask in plain text.

## 1. Preflight

- Run `bun install` if `node_modules/` is missing.
- PostgreSQL must be reachable (Redis too — background jobs fall back to a DB queue without it). Diagnose with `docker --version` / `docker info`:
  - **Docker running** → offer `docker compose up -d` (starts PostgreSQL + Redis from the bundled compose file).
  - **Docker installed, daemon stopped** → ask the user to start Docker Desktop (Linux: `sudo systemctl start docker`), then compose up.
  - **No Docker** → present both options in chat and let the user choose: install Docker (Windows `winget install Docker.DockerDesktop` — needs admin; macOS `brew install --cask docker`; Linux: distro guide at docs.docker.com) or point `DATABASE_URL` in `.env` at an existing PostgreSQL server.
- **Never install software without the user's explicit yes in chat.**
- If `bun run init` can't connect, it prints an "Environment diagnostics" block (OS, Docker state, exact fix commands) — relay it to the user rather than guessing.

## 2. Ask the user (one round of questions)

Read `scripts/indigo/registry.ts` for the installed-module catalog (ids + one-line descriptions), then ask:

1. **Modules** — which to keep: Recommended (the free set) / All / a custom pick from the catalog. Show descriptions, not just ids.
2. **Site name** — used in templates and written to `.env`.
3. **Admin email** — for the superadmin account.
4. **Demo content** — seed demo blog/portfolio/showcase content (good for exploring the CMS) or start clean.

Do **not** ask for a password — init generates a strong one and prints it; relay it to the user with a reminder to store it.

## 3. Run init (non-interactive)

```bash
NEXT_PUBLIC_SITE_NAME="<site name>" bun run init -- -y \
  --modules <ids|all|recommended> \
  --admin-email <email>
```

- Add `--no-seed` if the user chose a clean start.
- `--modules` accepts ids (`core-payments,core-subscriptions`), `all`, or `recommended`. Unknown ids exit 1 and print the valid list — fix and re-run; init is idempotent.
- Init derives the database name from the project folder (`my-app` → `my_app`) and creates it if missing. To use a different database or server, set `DATABASE_URL` in `.env` **before** running init.
- Capture the generated admin password from the output.

## 4. Verify and hand over

1. `bun run indigo doctor` — must pass.
2. Start the dev server in the background (`bun run dev`) and wait for "Server Ready".
3. Fetch `http://localhost:<PORT>` (PORT from `.env`, default 3000) to confirm the homepage renders.
4. Report back: the app URL, admin login (email + generated password), the installed modules **as printed by `bun run indigo list`** (don't recite from memory), and that removed modules can return via `bun run indigo add <id>`.

## Troubleshooting

- Port in use → kill stale `bun` processes and retry.
- DB connection refused → `docker compose up -d`, then re-run init.
- Never fall back to interactive `bun run init` — if an answer is missing, ask the user in chat and re-run with flags.
