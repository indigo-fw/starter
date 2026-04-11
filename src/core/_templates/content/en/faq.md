---
title: Frequently Asked Questions
type: page
description: Frequently asked questions about [[SITE_NAME]] — installation, customization, content management, and deployment.
seoTitle: "FAQ | [[SITE_NAME]]"
noindex: false
---

## General Questions

### What is [[SITE_NAME]]?

[[SITE_NAME]] is an open-source, AI agent-driven CMS and SaaS starter built on the T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). It provides a complete content management system with SaaS primitives like organizations, billing, and real-time notifications.

### Who is [[SITE_NAME]] for?

[[SITE_NAME]] is designed for developers and teams building SaaS products, marketing sites, blogs, or any content-driven application. It is especially well-suited for projects that leverage AI-assisted development workflows.

### Is [[SITE_NAME]] free to use?

Yes. [[SITE_NAME]] is open source under the AGPL-3.0 license. You can use it freely for any project. Commercial licenses are available if you need proprietary deployment without the AGPL requirements.

## Technical Questions

### What tech stack does [[SITE_NAME]] use?

[[SITE_NAME]] is built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL, and Better Auth. It also supports Redis for caching and rate limiting, BullMQ for background jobs, and WebSockets for real-time features.

### How do I deploy [[SITE_NAME]]?

[[SITE_NAME]] can be deployed anywhere that supports Node.js. Popular choices include Vercel, Railway, Fly.io, and any VPS with Docker. You will need a PostgreSQL database and optionally Redis for full functionality.

### Can I customize the design?

Absolutely. [[SITE_NAME]] uses an OKLCH design token system with Tailwind CSS v4. You can rebrand the entire application by changing a few CSS custom properties for hue, lightness, and chroma values.

## Content Management

### What content types are supported?

Out of the box, [[SITE_NAME]] supports pages, blog posts, portfolio items, showcase cards, categories, and tags. The content type registry is config-driven, so adding new types requires minimal code changes.

### Does [[SITE_NAME]] support multiple languages?

Yes. [[SITE_NAME]] has built-in i18n with proxy-rewrite locale routing, translation groups for content, and a translation bar in the admin panel. Add new locales by updating a single config array.

### Can I use a rich text editor?

Yes. The admin panel includes a Tiptap-based rich text editor with support for headings, lists, images, links, code blocks, and custom shortcodes. Content is stored as Markdown for portability.
