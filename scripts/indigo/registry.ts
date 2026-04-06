/**
 * Module registry — maps module IDs to their git repos and metadata.
 *
 * TODO: Create these GitHub repos under the indigo-fw org:
 *   - indigo-fw/core-billing
 *   - indigo-fw/core-payments-crypto
 *   - indigo-fw/core-support
 *   - indigo-fw/core-affiliates
 * Until repos exist, `indigo add` will fail on git subtree pull.
 * For local development, modules are already in src/ — use `indigo sync` instead.
 */

export interface ModuleRegistryEntry {
  /** Module identifier (matches directory name under src/) */
  id: string;
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
  {
    id: 'core-billing',
    repo: 'git@github.com:indigo-fw/core-billing.git',
    importName: 'coreBilling',
    free: true,
    description: 'Payment system: subscriptions, tokens, discounts, Stripe, dunning',
  },
  {
    id: 'core-payments-crypto',
    repo: 'git@github.com:indigo-fw/core-payments-crypto.git',
    importName: 'coreBillingCrypto',
    requires: ['core-billing'],
    description: 'Cryptocurrency payments via NOWPayments',
  },
  {
    id: 'core-support',
    repo: 'git@github.com:indigo-fw/core-support.git',
    importName: 'coreSupport',
    description: 'AI support chat + ticket system with escalation',
  },
  {
    id: 'core-affiliates',
    repo: 'git@github.com:indigo-fw/core-affiliates.git',
    importName: 'coreAffiliates',
    description: 'Referral tracking, attribution, affiliate management',
  },
  {
    id: 'core-ai-writer',
    repo: 'git@github.com:indigo-fw/core-ai-writer.git',
    importName: 'coreAiWriter',
    description: 'AI content generation, SEO optimization, translation, image alt text',
  },
  {
    id: 'core-docs',
    repo: 'git@github.com:indigo-fw/core-docs.git',
    importName: 'coreDocs',
    free: true,
    description: 'Documentation system — CMS, .md, .mdx sources with LLM export',
  },
  {
    id: 'core-store',
    repo: 'git@github.com:indigo-fw/core-store.git',
    importName: 'coreStore',
    requires: ['core-billing'],
    description: 'E-commerce — products, variants, cart, checkout, orders, shipping, tax (EU VAT)',
  },
];

export function getRegistryEntry(id: string): ModuleRegistryEntry | undefined {
  return REGISTRY.find((e) => e.id === id);
}
