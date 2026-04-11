interface StructuredDataProps {
  /** JSON-LD data object (will be serialized to JSON) */
  data: Record<string, unknown> | Record<string, unknown>[];
}

/** Serialize JSON-LD with safe escaping to prevent script tag injection */
function safeJsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Renders a JSON-LD structured data script tag.
 * Use in page components for SEO (schema.org, BreadcrumbList, Article, Product, etc.)
 *
 * @example
 * <StructuredData data={{
 *   '@context': 'https://schema.org',
 *   '@type': 'Article',
 *   headline: post.title,
 *   datePublished: post.publishedAt,
 * }} />
 */
export function StructuredData({ data }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdString(data) }}
    />
  );
}
