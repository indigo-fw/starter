---
title: SaaS Starter — Indigo Demo
description: The full Indigo framework running in production. Auth, billing, CMS, AI agents, multi-tenant orgs, real-time — all included.
date: 2026-04-15
image: /images/showcase/saas-starter.jpg
imageAlt: Indigo demo dashboard showing analytics, user management and billing screens
tags: [demo, saas, full-stack]
---

# SaaS Starter — Indigo Demo

This site itself is the live demo. Everything you interact with — auth, CMS, the dashboard, the billing flow — runs on Indigo, deployed to a €4/month Hetzner VPS via Docker and GitHub Actions.

## What's Included

- **Authentication** via Better Auth — email/password, magic links, OAuth, 2FA
- **Multi-tenant orgs** — invite members, manage roles, per-org billing
- **CMS** — this blog, showcase, portfolio, and all pages are managed content
- **Reverse trial** — 14-day Pro trial for new signups, automatic downgrade
- **Real-time** — WebSocket pub/sub via BullMQ and Redis
- **i18n** — 17 locales, locale-prefixed routing, content fallback

## Stack

Built with Next.js 16 (App Router), tRPC, Drizzle ORM, PostgreSQL, and Bun. Deployed behind Cloudflare with WAF rules, rate limiting, and edge caching.

## Get the Starter

```bash
claude "Set up a new project named my-saas from https://github.com/indigo-fw/starter — ask me what you need"
```

Or by hand: `bunx degit indigo-fw/starter my-saas`, then `bun install && bun run init`.