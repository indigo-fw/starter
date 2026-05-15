---
title: AI Writing Assistant
description: A subscription SaaS for long-form content creation. Built with Indigo's AI module, Stripe billing, and the TipTap rich-text editor.
date: 2026-03-20
image: /images/showcase/ai-writing.jpg
imageAlt: AI writing assistant interface with document editor and AI suggestions panel
tags: [ai, saas, writing, stripe]
---

# AI Writing Assistant

A content creation SaaS that lets teams draft, edit, and publish long-form articles with AI assistance. Built on Indigo in under two weeks using the `core-ai-writer` module.

## Features

- **AI Assist** in the rich-text editor — inline rewrites, tone adjustment, expand/summarise
- **Token-based metering** — usage tracked per org, billed monthly via Stripe
- **Collaboration** — real-time cursors, comments, and revision history
- **Publishing** — one-click export to blog CMS or as a standalone page

## Modules Used

```bash
bun run indigo add core-ai-writer
bun run indigo add core-payments
bun run indigo add core-subscriptions
```

## Time to Ship

14 days from `bunx degit` to first paying customer. Most of that time was spent on branding and onboarding copy — the actual product was functional in 3 days.
