/**
 * JSON-LD structured data builders for common schema.org types.
 * Used by content renderers to auto-generate structured data.
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
  authorName?: string | null;
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
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Build Article / BlogPosting JSON-LD */
export function buildArticleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': input.type ?? 'Article',
    headline: input.title,
    url: input.url,
    publisher: {
      '@type': 'Organization',
      name: input.siteName,
      url: input.siteUrl,
    },
  };

  if (input.description) data.description = input.description;
  if (input.image) {
    data.image = {
      '@type': 'ImageObject',
      url: input.image,
      ...(input.imageAlt && { name: input.imageAlt }),
    };
  }
  if (input.publishedAt) data.datePublished = toISOString(input.publishedAt);
  if (input.updatedAt) data.dateModified = toISOString(input.updatedAt);
  if (input.authorName) {
    data.author = { '@type': 'Person', name: input.authorName };
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

/** Build Organization JSON-LD (for root layout) */
export function buildOrganizationJsonLd(input: OrganizationJsonLdInput): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    url: input.url,
  };

  if (input.logo) data.logo = input.logo;
  if (input.description) data.description = input.description;

  return data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toISOString(date: Date | string): string {
  return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
}
