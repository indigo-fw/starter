/**
 * Module registry — maps module IDs to their git repos and metadata.
 *
 * GitHub org: https://github.com/indigo-fw
 */

import type { ModuleCategory } from '@/core/lib/module/module-config';

export interface ModuleRegistryEntry {
  /** Module identifier (matches directory name under src/) */
  id: string;
  /** Module category — 'primitive' (horizontal building block) or 'product' (vertical domain) */
  category: ModuleCategory;
  /** Git repo URL for subtree */
  repo: string;
  /** Variable name for the import in indigo.config.ts */
  importName: string;
  /** Dependencies (other modules that must be installed first) */
  requires?: string[];
  /** Whether this is a free module (shipped with starter) */
  free?: boolean;
  /** Short description */
  description: string;
}

export const REGISTRY: ModuleRegistryEntry[] = [
  // ─── Primitives (horizontal building blocks) ─────────────────────────────────
  {
    id: 'core-payments',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-payments.git',
    importName: 'corePayments',
    free: true,
    description: 'Payment provider abstraction layer (Stripe integration)',
  },
  {
    id: 'core-subscriptions',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-subscriptions.git',
    importName: 'coreSubscriptions',
    requires: ['core-payments'],
    free: true,
    description: 'Subscription plans, tokens, discounts, dunning',
  },
  {
    id: 'core-payments-crypto',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-payments-crypto.git',
    importName: 'corePaymentsCrypto',
    requires: ['core-payments'],
    description: 'Cryptocurrency payments via NOWPayments',
  },
  {
    id: 'core-support',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-support.git',
    importName: 'coreSupport',
    description: 'AI support chat + ticket system with escalation',
  },
  {
    id: 'core-affiliates',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-affiliates.git',
    importName: 'coreAffiliates',
    description: 'Referral tracking, attribution, affiliate management',
  },
  {
    id: 'core-ai-writer',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-ai-writer.git',
    importName: 'coreAiWriter',
    description: 'AI content generation, SEO optimization, translation, image alt text',
  },
  {
    id: 'core-import',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-import.git',
    importName: 'coreImport',
    description: 'Data import and migration tools',
  },
  {
    id: 'core-docs',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-docs.git',
    importName: 'coreDocs',
    free: true,
    description: 'Documentation system — CMS, .md, .mdx sources with LLM export',
  },
  {
    id: 'core-authors',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-authors.git',
    importName: 'coreAuthors',
    description: 'Multi-author profiles, bylines, and polymorphic content attribution',
  },
  {
    id: 'core-multisite',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-multisite.git',
    importName: 'coreMultisite',
    description: 'Multi-tenant site isolation — PostgreSQL schema-per-site, domain mapping',
  },
  {
    id: 'core-api',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-api.git',
    importName: 'coreApi',
    description: 'Org-scoped REST API v2 with key management, scopes, rate limiting, metering',
  },
  {
    id: 'core-comments',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-comments.git',
    importName: 'coreComments',
    free: true,
    description: 'Polymorphic threaded comments with moderation',
  },
  {
    id: 'core-activity',
    category: 'primitive',
    repo: 'git@github.com:indigo-fw/core-activity.git',
    importName: 'coreActivity',
    free: true,
    description: 'User-facing activity feed and timeline',
  },
  // ─── Products (vertical domain apps) ────────────────────────────────────────
  {
    id: 'core-store',
    category: 'product',
    repo: 'git@github.com:indigo-fw/core-store.git',
    importName: 'coreStore',
    requires: ['core-payments'],
    description: 'E-commerce — products, variants, cart, checkout, orders, shipping, tax (EU VAT)',
  },
  {
    id: 'core-chat',
    category: 'product',
    repo: 'git@github.com:indigo-fw/core-chat.git',
    importName: 'coreChat',
    requires: ['core-subscriptions'],
    description: 'AI character chat — characters, conversations, messages, providers, media',
  },
  {
    id: 'core-booking',
    category: 'product',
    repo: 'git@github.com:indigo-fw/core-booking.git',
    importName: 'coreBooking',
    description: 'Booking and appointment scheduling — services, availability, reservations',
  },
];

export function getRegistryEntry(id: string): ModuleRegistryEntry | undefined {
  return REGISTRY.find((e) => e.id === id);
}
