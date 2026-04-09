/**
 * Media seeding and CMS content seeding for the Indigo init script.
 * Extracted from init.ts Steps 6 + 7 — do not change logic, only the module boundary.
 *
 * Both functions receive `db` as a parameter — they do NOT create postgres connections.
 * Schema imports are dynamic (relative paths from this file's location in seed/).
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count } from 'drizzle-orm';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  type CompanyInfo,
  SEED_IMAGES,
  CATEGORIES_DATA,
  TAGS_DATA,
  createPlaceholderPng,
  simpleSlugify,
  formatDate,
  generateBlogPost,
  log,
  token,
} from './helpers';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MediaRecord {
  id: string;
  filename: string;
  filepath: string;
}

export interface CmsContentResult {
  categoryIds: string[];
  tagIds: string[];
  postIds: string[];
  portfolioIds: string[];
  showcaseIds: string[];
}

// ─── Step 6: Seed Media ────────────────────────────────────────────────────

export async function seedMedia(db: PostgresJsDatabase): Promise<MediaRecord[]> {
  const uploadsDir = path.resolve(process.cwd(), 'uploads', 'seed');

  if (fs.existsSync(uploadsDir)) {
    log('⏭️', 'uploads/seed/ already exists. Skipping media generation.');
    // Still need to return media records from DB for content seeding
    const { cmsMedia } = await import('../../server/db/schema/media');
    const records = await db.select({
      id: cmsMedia.id,
      filename: cmsMedia.filename,
      filepath: cmsMedia.filepath,
    }).from(cmsMedia).limit(50);
    return records;
  }

  log('🖼️', 'Generating placeholder images...');

  fs.mkdirSync(uploadsDir, { recursive: true });

  const mediaRecords: MediaRecord[] = [];
  const { cmsMedia } = await import('../../server/db/schema/media');

  for (const img of SEED_IMAGES) {
    const pngBuffer = createPlaceholderPng(img.width, img.height, img.r, img.g, img.b);
    const filePath = path.join(uploadsDir, img.filename);
    fs.writeFileSync(filePath, pngBuffer);

    const [record] = await db.insert(cmsMedia).values({
      filename: img.filename,
      filepath: `uploads/seed/${img.filename}`,
      fileType: 1, // IMAGE
      mimeType: 'image/png',
      fileSize: pngBuffer.length,
      altText: img.alt,
      width: img.width,
      height: img.height,
    }).returning();

    if (record) {
      mediaRecords.push({ id: record.id, filename: record.filename, filepath: record.filepath });
    }
  }

  log('✅', `${SEED_IMAGES.length} placeholder images generated and ${mediaRecords.length} media records created.`);

  return mediaRecords;
}

// ─── Step 7: Seed Content ──────────────────────────────────────────────────

export async function seedCmsContent(db: PostgresJsDatabase, companyInfo: CompanyInfo): Promise<CmsContentResult> {
  const { cmsPosts } = await import('../../server/db/schema/cms');
  const { cmsCategories } = await import('../../server/db/schema/categories');
  const { cmsTermRelationships } = await import('../../server/db/schema/term-relationships');
  const { cmsTerms } = await import('../../server/db/schema/terms');
  const { cmsPortfolio } = await import('../../server/db/schema/portfolio');
  const { cmsShowcase } = await import('../../server/db/schema/showcase');

  // Check if any posts exist
  const [existing] = await db
    .select({ count: count() })
    .from(cmsPosts);

  if ((existing?.count ?? 0) > 0) {
    log('⏭️', 'Content already exists.');
    return { categoryIds: [], tagIds: [], postIds: [], portfolioIds: [], showcaseIds: [] };
  }

  log('📝', 'Seeding content...');
  const now = Date.now();

  // ── 7a. Categories (6) ──────────────────────────────────────────

  const categoryRecords = await db.insert(cmsCategories).values(
    CATEGORIES_DATA.map((cat) => ({
      name: cat.name,
      slug: cat.slug,
      lang: 'en',
      title: cat.title,
      content: cat.content,
      status: 1,
      order: cat.order,
      publishedAt: new Date(),
      previewToken: token(),
    }))
  ).returning();

  log('  📂', `${categoryRecords.length} categories created.`);

  // ── 7b. Tags (12) ───────────────────────────────────────────────

  const tagRecords = await db.insert(cmsTerms).values(
    TAGS_DATA.map((tagName) => ({
      taxonomyId: 'tag',
      name: tagName,
      slug: simpleSlugify(tagName),
      lang: 'en',
      status: 1,
    }))
  ).returning();

  log('  🏷️', `${tagRecords.length} tags created.`);

  // ── 7c. Legal pages (from seed templates → content/ files) ──────
  //
  // Templates live in core/seed-templates/{locale}/.
  // The init script copies them to content/{locale}/ with variable substitution.
  // The runtime content sync (server.ts) then inserts them into the CMS.

  const { seedContentFiles, contentFilesExist } = await import('@/core/lib/seed-content');

  if (!contentFilesExist()) {
    const count = seedContentFiles({
      SITE_NAME: companyInfo.siteName,
      SITE_URL: companyInfo.siteUrl,
      COMPANY_NAME: companyInfo.companyName,
      COMPANY_ADDRESS: companyInfo.companyAddress,
      COMPANY_ID: companyInfo.companyId,
      COMPANY_JURISDICTION: companyInfo.companyJurisdiction,
      CONTACT_EMAIL: companyInfo.contactEmail,
      CURRENT_DATE: formatDate(new Date()),
    });
    log('  📜', `${count} legal page templates written to content/. They will sync to DB on server start.`);
  } else {
    log('  ⏭️', 'content/ directory already has .md files. Skipping template seeding.');
  }

  // ── 7d. Standard pages (3) ──────────────────────────────────────

  await db.insert(cmsPosts).values({
    type: 1,
    status: 1,
    lang: 'en',
    slug: 'welcome',
    title: 'Welcome to Indigo',
    content: `## Your CMS is ready!

This is a sample page created by the init script. You can edit or delete it from the [admin panel](/dashboard/cms/pages).

### Getting Started

- Create pages and blog posts from the dashboard
- Upload media files to the media library
- Configure site settings under Settings
- Manage users and roles from the Users section
- Set up categories and tags to organize your content

Check out the [blog](/blog) for your latest posts, or explore the [portfolio](/portfolio) to see project showcases.`,
    metaDescription: `Welcome to ${companyInfo.siteName} — an agent-driven headless CMS for T3 Stack.`,
    publishedAt: new Date(),
    previewToken: token(),
  });

  await db.insert(cmsPosts).values({
    type: 1,
    status: 1,
    lang: 'en',
    slug: 'about',
    title: 'About Indigo',
    content: `## What is Indigo?

Indigo is an open-source, agent-driven headless CMS built on the T3 Stack. It combines Next.js, tRPC, Drizzle ORM, and Better Auth into a cohesive content management system that is optimized for AI-assisted development.

### Key Features

- **Agent-Driven Development** — CLAUDE.md serves as the comprehensive project guide, enabling AI agents to understand and modify the codebase effectively
- **Modern Stack** — Built with Next.js 16, TypeScript, and Tailwind CSS v4
- **Flexible Content** — Pages, blog posts, portfolio items, showcase cards, categories, and tags
- **Role-Based Access** — User, editor, admin, and superadmin roles with policy-based permissions
- **Media Management** — Upload, organize, and serve media files with automatic thumbnails
- **SEO Optimized** — Meta descriptions, OG images, JSON-LD, dynamic sitemaps, and slug redirects
- **SaaS Primitives** — Organizations, Stripe billing, notifications, WebSocket real-time

### Open Source

Indigo is open source (AGPL-3.0) and available on GitHub. Commercial licenses available for proprietary use. Contributions are welcome!`,
    metaDescription: 'Indigo is an open-source, agent-driven headless CMS built on the T3 Stack (Next.js + tRPC + Drizzle).',
    seoTitle: 'About Indigo — Agent-Driven Headless CMS',
    publishedAt: new Date(),
    previewToken: token(),
  });

  await db.insert(cmsPosts).values({
    type: 1,
    status: 1,
    lang: 'en',
    slug: 'faq',
    title: 'Frequently Asked Questions',
    content: `## General Questions

### What is Indigo?

Indigo is an open-source, AI agent-driven CMS and SaaS starter built on the T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). It provides a complete content management system with SaaS primitives like organizations, billing, and real-time notifications.

### Who is Indigo for?

Indigo is designed for developers and teams building SaaS products, marketing sites, blogs, or any content-driven application. It is especially well-suited for projects that leverage AI-assisted development workflows.

### Is Indigo free to use?

Yes. Indigo is open source under the AGPL-3.0 license. You can use it freely for any project. Commercial licenses are available if you need proprietary deployment without the AGPL requirements.

## Technical Questions

### What tech stack does Indigo use?

Indigo is built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL, and Better Auth. It also supports Redis for caching and rate limiting, BullMQ for background jobs, and WebSockets for real-time features.

### How do I deploy Indigo?

Indigo can be deployed anywhere that supports Node.js. Popular choices include Vercel, Railway, Fly.io, and any VPS with Docker. You will need a PostgreSQL database and optionally Redis for full functionality.

### Can I customize the design?

Absolutely. Indigo uses an OKLCH design token system with Tailwind CSS v4. You can rebrand the entire application by changing a few CSS custom properties for hue, lightness, and chroma values.

## Content Management

### What content types are supported?

Out of the box, Indigo supports pages, blog posts, portfolio items, showcase cards, categories, and tags. The content type registry is config-driven, so adding new types requires minimal code changes.

### Does Indigo support multiple languages?

Yes. Indigo has built-in i18n with proxy-rewrite locale routing, translation groups for content, and a translation bar in the admin panel. Add new locales by updating a single config array.

### Can I use a rich text editor?

Yes. The admin panel includes a Tiptap-based rich text editor with support for headings, lists, images, links, code blocks, and custom shortcodes. Content is stored as Markdown for portability.`,
    metaDescription: 'Frequently asked questions about Indigo — installation, customization, content management, and deployment.',
    seoTitle: 'FAQ — Indigo',
    publishedAt: new Date(),
    previewToken: token(),
  });

  log('  📄', '3 standard pages created (Welcome, About, FAQ).');

  // ── 7e. Blog posts (101) ────────────────────────────────────────

  const BATCH_SIZE = 20;
  const allBlogPosts: Array<{ id: string; categoryIdx: number; tagIndices: number[] }> = [];

  for (let batchStart = 0; batchStart < 101; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, 101);
    const batchData = [];

    for (let i = batchStart; i < batchEnd; i++) {
      batchData.push(generateBlogPost(i));
    }

    const inserted = await db.insert(cmsPosts).values(
      batchData.map((post) => ({
        type: 2, // BLOG
        status: post.status,
        lang: 'en',
        slug: post.slug,
        title: post.title,
        content: post.content,
        metaDescription: post.metaDescription,
        featuredImage: post.featuredImage,
        featuredImageAlt: `Header image for ${post.title}`,
        noindex: false,
        publishedAt: post.publishedAt,
        previewToken: crypto.randomBytes(32).toString('hex'),
      }))
    ).returning();

    for (let j = 0; j < inserted.length; j++) {
      const record = inserted[j]!;
      const postData = batchData[j]!;
      allBlogPosts.push({
        id: record.id,
        categoryIdx: postData.categoryIdx,
        tagIndices: postData.tagIndices,
      });
    }
  }

  log('  📰', `${allBlogPosts.length} blog posts created (90 published, 3 scheduled, 8 drafts).`);

  // ── 7f. Portfolio items (4) ─────────────────────────────────────

  const portfolioRecords = await db.insert(cmsPortfolio).values([
    {
      name: 'Indigo Website',
      slug: 'indigo-website',
      lang: 'en',
      title: 'Indigo — Official Website',
      content: `## Project Overview

Built the official website and documentation for the Indigo open-source project. The site showcases the CMS features, provides getting-started guides, and hosts the project blog.

## Highlights

- Server-side rendered with Next.js App Router for optimal SEO
- Full-text search across all documentation
- Dynamic sitemap generation
- Responsive design with dark mode support`,
      status: 1,
      publishedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      completedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      clientName: 'SweetAI',
      projectUrl: 'https://github.com/indigo-fw/starter',
      techStack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'PostgreSQL', 'tRPC'],
      metaDescription: 'Official website for the Indigo open-source headless CMS, built with Next.js and TypeScript.',
      featuredImage: '/api/uploads/seed/portfolio-01.png',
      featuredImageAlt: 'Indigo Website screenshot',
      previewToken: token(),
    },
    {
      name: 'E-Commerce Dashboard',
      slug: 'ecommerce-dashboard',
      lang: 'en',
      title: 'E-Commerce Analytics Dashboard',
      content: `## Project Overview

Designed and built a real-time analytics dashboard for an e-commerce platform. The dashboard provides insights into sales, customer behavior, and inventory management.

## Features

- Real-time sales tracking with WebSocket updates
- Interactive charts and data visualization
- Inventory alerts and automated reporting
- Role-based access for store managers and executives`,
      status: 1,
      publishedAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      completedAt: new Date(now - 20 * 24 * 60 * 60 * 1000),
      clientName: 'Acme Corp',
      techStack: ['React', 'TypeScript', 'D3.js', 'Node.js', 'Redis'],
      metaDescription: 'Real-time e-commerce analytics dashboard with interactive charts and automated reporting.',
      featuredImage: '/api/uploads/seed/portfolio-02.png',
      featuredImageAlt: 'E-Commerce Dashboard screenshot',
      previewToken: token(),
    },
    {
      name: 'Mobile Banking App',
      slug: 'mobile-banking-app',
      lang: 'en',
      title: 'Mobile Banking Application',
      content: `## Project Overview

Developed a cross-platform mobile banking application for FinTech Corp. The app enables customers to manage accounts, transfer funds, pay bills, and track spending with real-time notifications.

## Features

- Biometric authentication (Face ID, fingerprint)
- Real-time push notifications for transactions
- Budget tracking with visual spending breakdowns
- Bill payment scheduling and recurring transfers
- Multi-currency support with live exchange rates`,
      status: 1,
      publishedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
      completedAt: new Date(now - 30 * 24 * 60 * 60 * 1000),
      clientName: 'FinTech Corp',
      techStack: ['React Native', 'TypeScript', 'Node.js', 'PostgreSQL'],
      metaDescription: 'Cross-platform mobile banking application with biometric auth, real-time notifications, and budget tracking.',
      featuredImage: '/api/uploads/seed/portfolio-03.png',
      featuredImageAlt: 'Mobile Banking App screenshot',
      previewToken: token(),
    },
    {
      name: 'SaaS Analytics Platform',
      slug: 'saas-analytics-platform',
      lang: 'en',
      title: 'SaaS Analytics Platform',
      content: `## Project Overview

Built a comprehensive analytics platform for DataViz Inc that processes millions of events daily. The platform provides real-time dashboards, custom report builders, and automated insights powered by machine learning.

## Features

- Real-time event streaming and aggregation pipeline
- Drag-and-drop custom dashboard builder
- Automated anomaly detection and alerting
- Data export in multiple formats (CSV, JSON, Parquet)
- Team collaboration with shared dashboards and annotations`,
      status: 1,
      publishedAt: new Date(now - 40 * 24 * 60 * 60 * 1000),
      completedAt: new Date(now - 40 * 24 * 60 * 60 * 1000),
      clientName: 'DataViz Inc',
      projectUrl: 'https://dataviz-demo.example.com',
      techStack: ['Next.js', 'PostgreSQL', 'Redis', 'ClickHouse', 'Python'],
      metaDescription: 'SaaS analytics platform with real-time dashboards, custom reports, and ML-powered anomaly detection.',
      featuredImage: '/api/uploads/seed/portfolio-04.png',
      featuredImageAlt: 'SaaS Analytics Platform screenshot',
      previewToken: token(),
    },
  ]).returning();

  log('  💼', `${portfolioRecords.length} portfolio items created.`);

  // ── 7g. Showcase items (5) ──────────────────────────────────────

  const showcaseRecords = await db.insert(cmsShowcase).values([
    // 1 — shorts, richtext
    {
      title: 'Welcome to Indigo',
      slug: 'welcome-to-indigo',
      lang: 'en',
      description: `## Build SaaS apps faster\n\nIndigo is a complete framework for shipping production-ready SaaS applications. Auth, billing, CMS, real-time — all wired up.\n\nScroll down to see what's inside.`,
      cardType: 'richtext',
      variant: 'shorts',
      status: 1,
      sortOrder: 0,
      publishedAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
      metaDescription: 'Introduction to the Indigo SaaS framework.',
      previewToken: token(),
    },
    // 2 — shorts, image
    {
      title: 'Ship in Days, Not Months',
      slug: 'ship-in-days-not-months',
      lang: 'en',
      description: 'Stop wiring boilerplate. Start with auth, orgs, billing, and a CMS that actually works.',
      cardType: 'image',
      variant: 'shorts',
      mediaUrl: '/api/uploads/seed/showcase-01.png',
      thumbnailUrl: '/api/uploads/seed/showcase-01.png',
      status: 1,
      sortOrder: 1,
      publishedAt: new Date(now - 9 * 24 * 60 * 60 * 1000),
      metaDescription: 'Ship your SaaS faster with Indigo.',
      previewToken: token(),
    },
    // 3 — contained, video
    {
      title: 'See It in Action',
      slug: 'see-it-in-action',
      lang: 'en',
      description: 'A quick walkthrough of the Indigo dashboard — content management, org settings, and the module system.',
      cardType: 'video',
      variant: 'contained',
      mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      status: 1,
      sortOrder: 2,
      publishedAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
      metaDescription: 'Video walkthrough of the Indigo framework.',
      previewToken: token(),
    },
    // 4 — contained, richtext
    {
      title: 'Modular by Design',
      slug: 'modular-by-design',
      lang: 'en',
      description: `## Install only what you need\n\n\`bun run indigo add core-support\`\n\nEach module brings its own schema, routes, admin UI, and seed data. Remove what you don't need — no dead code, no bloat.\n\n- **core-payments** — Stripe, crypto\n- **core-support** — AI chat, tickets\n- **core-docs** — documentation system\n- **core-store** — full e-commerce`,
      cardType: 'richtext',
      variant: 'contained',
      status: 1,
      sortOrder: 3,
      publishedAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      metaDescription: 'Indigo modular architecture — install only what you need.',
      previewToken: token(),
    },
    // 5 — full, image
    {
      title: 'Built for Teams',
      slug: 'built-for-teams',
      lang: 'en',
      description: 'Multi-tenancy, RBAC, org-scoped data, and real-time presence — everything you need for collaborative SaaS applications.',
      cardType: 'image',
      variant: 'full',
      mediaUrl: '/api/uploads/seed/showcase-02.png',
      thumbnailUrl: '/api/uploads/seed/showcase-02.png',
      status: 1,
      sortOrder: 4,
      publishedAt: new Date(now - 6 * 24 * 60 * 60 * 1000),
      metaDescription: 'Multi-tenant team features in Indigo.',
      previewToken: token(),
    },
    // 6 — shorts, richtext
    {
      title: 'What Our Users Say',
      slug: 'what-our-users-say',
      lang: 'en',
      description: `> "We went from zero to a paying product in two weeks. The module system meant we didn't have to build auth, billing, or the admin panel from scratch."\n\n— **Alex Rivera**, Founder at LaunchFast\n\n> "Finally a framework that treats CMS as a first-class citizen, not an afterthought."\n\n— **Maria Chen**, Head of Content at DataFlow`,
      cardType: 'richtext',
      variant: 'shorts',
      status: 1,
      sortOrder: 5,
      publishedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      metaDescription: 'What developers say about building with Indigo.',
      previewToken: token(),
    },
    // 7 — full, richtext
    {
      title: 'AI-Powered Workflows',
      slug: 'ai-powered-workflows',
      lang: 'en',
      description: `## Content meets intelligence\n\nIndigo integrates AI at the infrastructure level:\n\n- **AI Writer** — generate blog posts, SEO meta, translations\n- **AI Support** — chatbot with live agent takeover\n- **Smart fields** — auto-generate alt text, summaries, tags\n\nBring your own provider or use the built-in OpenAI/Anthropic adapters.`,
      cardType: 'richtext',
      variant: 'full',
      status: 1,
      sortOrder: 6,
      publishedAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
      metaDescription: 'AI-powered content and support workflows in Indigo.',
      previewToken: token(),
    },
    // 8 — contained, image
    {
      title: 'Production-Ready Infrastructure',
      slug: 'production-ready-infrastructure',
      lang: 'en',
      description: 'WebSockets, BullMQ job queues, Redis pub/sub, S3 storage — the boring stuff, done right, so you can focus on your product.',
      cardType: 'image',
      variant: 'contained',
      mediaUrl: '/api/uploads/seed/showcase-01.png',
      thumbnailUrl: '/api/uploads/seed/showcase-01.png',
      status: 1,
      sortOrder: 7,
      publishedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      metaDescription: 'Production infrastructure in Indigo.',
      previewToken: token(),
    },
    // 9 — shorts, richtext
    {
      title: 'Get Started',
      slug: 'get-started',
      lang: 'en',
      description: `## Clone. Init. Ship.\n\n\`\`\`bash\ngit clone https://github.com/indigo-fw/starter my-app\ncd my-app && bun install\nbun run init\nbun run dev\n\`\`\`\n\nYou'll have a running app with auth, CMS, and a dashboard in under 5 minutes.`,
      cardType: 'richtext',
      variant: 'shorts',
      status: 1,
      sortOrder: 8,
      publishedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      metaDescription: 'Get started with Indigo in 5 minutes.',
      previewToken: token(),
    },
    // 10 — full, video
    {
      title: 'Deep Dive: Module System',
      slug: 'deep-dive-module-system',
      lang: 'en',
      description: 'How the module system works under the hood — from indigo.config.ts to generated glue files.',
      cardType: 'video',
      variant: 'full',
      mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      status: 1,
      sortOrder: 9,
      publishedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
      metaDescription: 'Deep dive into the Indigo module system.',
      previewToken: token(),
    },
  ]).returning();

  log('  🎴', `${showcaseRecords.length} showcase items created.`);

  // ── 7h. Relationships ───────────────────────────────────────────

  log('  🔗', 'Wiring up term relationships...');

  const relationships: Array<{ objectId: string; termId: string; taxonomyId: string }> = [];

  // Blog post -> category and tag relationships
  for (const post of allBlogPosts) {
    const category = categoryRecords[post.categoryIdx];
    if (category) {
      relationships.push({
        objectId: post.id,
        termId: category.id,
        taxonomyId: 'category',
      });
    }

    for (const tagIdx of post.tagIndices) {
      const tag = tagRecords[tagIdx];
      if (tag) {
        relationships.push({
          objectId: post.id,
          termId: tag.id,
          taxonomyId: 'tag',
        });
      }
    }
  }

  // Portfolio -> tag relationships
  // Portfolio 1 (Indigo Website) -> Next.js, TypeScript, Tailwind CSS
  const tagNextjs = tagRecords.find((t) => t.slug === 'nextjs');
  const tagTypescript = tagRecords.find((t) => t.slug === 'typescript');
  const tagTailwind = tagRecords.find((t) => t.slug === 'tailwind-css');
  const tagPostgresql = tagRecords.find((t) => t.slug === 'postgresql');
  const tagDocker = tagRecords.find((t) => t.slug === 'docker');
  const tagReact = tagRecords.find((t) => t.slug === 'react');
  const tagPerformance = tagRecords.find((t) => t.slug === 'performance');

  if (portfolioRecords[0] && tagNextjs) relationships.push({ objectId: portfolioRecords[0].id, termId: tagNextjs.id, taxonomyId: 'tag' });
  if (portfolioRecords[0] && tagTypescript) relationships.push({ objectId: portfolioRecords[0].id, termId: tagTypescript.id, taxonomyId: 'tag' });
  if (portfolioRecords[0] && tagTailwind) relationships.push({ objectId: portfolioRecords[0].id, termId: tagTailwind.id, taxonomyId: 'tag' });

  // Portfolio 2 (E-Commerce Dashboard) -> TypeScript, React, Performance
  if (portfolioRecords[1] && tagTypescript) relationships.push({ objectId: portfolioRecords[1].id, termId: tagTypescript.id, taxonomyId: 'tag' });
  if (portfolioRecords[1] && tagReact) relationships.push({ objectId: portfolioRecords[1].id, termId: tagReact.id, taxonomyId: 'tag' });
  if (portfolioRecords[1] && tagPerformance) relationships.push({ objectId: portfolioRecords[1].id, termId: tagPerformance.id, taxonomyId: 'tag' });

  // Portfolio 3 (Mobile Banking) -> React, TypeScript
  if (portfolioRecords[2] && tagReact) relationships.push({ objectId: portfolioRecords[2].id, termId: tagReact.id, taxonomyId: 'tag' });
  if (portfolioRecords[2] && tagTypescript) relationships.push({ objectId: portfolioRecords[2].id, termId: tagTypescript.id, taxonomyId: 'tag' });

  // Portfolio 4 (SaaS Analytics) -> Next.js, PostgreSQL, Docker
  if (portfolioRecords[3] && tagNextjs) relationships.push({ objectId: portfolioRecords[3].id, termId: tagNextjs.id, taxonomyId: 'tag' });
  if (portfolioRecords[3] && tagPostgresql) relationships.push({ objectId: portfolioRecords[3].id, termId: tagPostgresql.id, taxonomyId: 'tag' });
  if (portfolioRecords[3] && tagDocker) relationships.push({ objectId: portfolioRecords[3].id, termId: tagDocker.id, taxonomyId: 'tag' });

  // Showcase -> tag relationships
  // Showcase 0 (Welcome to Showcase) -> Next.js, TypeScript
  if (showcaseRecords[0] && tagNextjs) relationships.push({ objectId: showcaseRecords[0].id, termId: tagNextjs.id, taxonomyId: 'tag' });
  if (showcaseRecords[0] && tagTypescript) relationships.push({ objectId: showcaseRecords[0].id, termId: tagTypescript.id, taxonomyId: 'tag' });

  // Showcase 2 (Image Card Example) -> Tailwind CSS
  if (showcaseRecords[2] && tagTailwind) relationships.push({ objectId: showcaseRecords[2].id, termId: tagTailwind.id, taxonomyId: 'tag' });

  // Showcase 3 (Product Feature Highlight) -> React, Performance
  if (showcaseRecords[3] && tagReact) relationships.push({ objectId: showcaseRecords[3].id, termId: tagReact.id, taxonomyId: 'tag' });
  if (showcaseRecords[3] && tagPerformance) relationships.push({ objectId: showcaseRecords[3].id, termId: tagPerformance.id, taxonomyId: 'tag' });

  // Batch insert relationships
  const REL_BATCH_SIZE = 50;
  for (let i = 0; i < relationships.length; i += REL_BATCH_SIZE) {
    const batch = relationships.slice(i, i + REL_BATCH_SIZE);
    await db.insert(cmsTermRelationships).values(batch);
  }

  log('  ✅', `${relationships.length} term relationships created.`);

  // ── Summary ─────────────────────────────────────────────────────

  console.log('');
  log('✅', `Content seeded: ${categoryRecords.length} categories, ${tagRecords.length} tags, 3 standard pages, ${allBlogPosts.length} blog posts, ${portfolioRecords.length} portfolio items, ${showcaseRecords.length} showcase items.`);

  return {
    categoryIds: categoryRecords.map((r) => r.id),
    tagIds: tagRecords.map((r) => r.id),
    postIds: allBlogPosts.map((r) => r.id),
    portfolioIds: portfolioRecords.map((r) => r.id),
    showcaseIds: showcaseRecords.map((r) => r.id),
  };
}
