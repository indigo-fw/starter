/**
 * JSON-LD structured data builders for common schema.org types.
 * Used by content renderers to auto-generate structured data.
 *
 * Follows Google Search Central rich results guidelines:
 * - Article/BlogPosting: headline, image, datePublished, author, publisher, mainEntityOfPage
 * - Organization: @id fragment for cross-referencing, logo, contactPoint, sameAs
 * - WebSite: links to Organization via publisher @id
 * - BreadcrumbList: position-indexed ListItems
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArticleJsonLdInput {
  title: string;
  description?: string | null;
  url: string;
  image?: string | null;
  imageAlt?: string | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  /** Single author name or array of author names */
  authorNames?: string[];
  /** Language code (e.g. 'en', 'de') for inLanguage field */
  locale?: string;
  siteName: string;
  siteUrl: string;
  /** 'Article' | 'BlogPosting' | 'NewsArticle' */
  type?: string;
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface OrganizationJsonLdInput {
  name: string;
  url: string;
  logo?: string | null;
  description?: string | null;
  contactEmail?: string | null;
  /** Social profile URLs (Twitter, GitHub, Facebook, etc.) */
  sameAs?: string[];
}

interface WebSiteJsonLdInput {
  name: string;
  url: string;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Build Article / BlogPosting JSON-LD per Google rich results spec */
export function buildArticleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': input.type ?? 'Article',
    '@id': input.url,
    headline: input.title,
    url: input.url,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': input.url,
    },
    publisher: {
      '@type': 'Organization',
      '@id': `${input.siteUrl}/#organization`,
      name: input.siteName,
      url: input.siteUrl,
    },
  };

  if (input.description) data.description = input.description;
  if (input.locale) data.inLanguage = input.locale;
  if (input.image) {
    data.image = {
      '@type': 'ImageObject',
      url: input.image,
      ...(input.imageAlt && { caption: input.imageAlt }),
    };
  }
  if (input.publishedAt) data.datePublished = toISOString(input.publishedAt);
  if (input.updatedAt) data.dateModified = toISOString(input.updatedAt);
  if (input.authorNames?.length) {
    const persons = input.authorNames.map((name) => ({ '@type': 'Person', name }));
    data.author = persons.length === 1 ? persons[0] : persons;
  }

  return data;
}

/** Build BreadcrumbList JSON-LD */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Build Organization JSON-LD with @id fragment for cross-referencing */
export function buildOrganizationJsonLd(input: OrganizationJsonLdInput): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${input.url}/#organization`,
    name: input.name,
    url: input.url,
  };

  if (input.logo) {
    data.logo = { '@type': 'ImageObject', url: input.logo };
  }
  if (input.description) data.description = input.description;
  if (input.contactEmail) {
    data.contactPoint = {
      '@type': 'ContactPoint',
      email: input.contactEmail,
      contactType: 'customer support',
    };
  }
  if (input.sameAs?.length) {
    data.sameAs = input.sameAs.filter(Boolean);
  }

  return data;
}

/** Build WebSite JSON-LD — links to Organization via publisher @id */
export function buildWebSiteJsonLd(input: WebSiteJsonLdInput): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${input.url}/#website`,
    name: input.name,
    url: input.url,
    publisher: { '@id': `${input.url}/#organization` },
  };

  if (input.description) data.description = input.description;

  return data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toISOString(date: Date | string): string {
  return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
}
