---
title: CMS and Content Sync
description: How Indigo's file-based CMS keeps Markdown files and the database in sync — automatic on server start, no manual import steps.
date: 2026-02-15
tags: [cms, content, markdown, mdx]
---

# CMS and Content Sync

Indigo ships a hybrid CMS: content lives in .md and .mdx files under content/, but is served from PostgreSQL for fast, filterable queries.

## How It Works

On every server start, bun run content:sync runs automatically. It scans content/{locale}/ and upserts each file into the cms_posts table — preserving slugs, frontmatter, translation groups, and publish status. The sync is idempotent: running it twice changes nothing.

## Two-Way Rules

Files take precedence on conflict. Delete the file to remove the DB record.

## MDX and Rich Content

.mdx files unlock React component embeds — code demos, interactive callouts, data tables — all rendered server-side via Next.js. The core-docs module uses .mdx for documentation; the main CMS uses .md for marketing content.

## Translation Grouping

Files with the same slug across locales are auto-grouped. Different slugs across locales can be linked with translationOf: en-slug frontmatter. Groups power the language switcher and hreflang tags.

## Why File-Based at All?

Files version-control naturally. Docs never get lost in a database dump. And on the demo instance, bun run init -- -y --reset reseeds content from the checked-in files every hour — so the demo always recovers cleanly.
