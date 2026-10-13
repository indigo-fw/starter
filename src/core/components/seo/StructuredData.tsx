interface StructuredDataProps {
  /** JSON-LD data object (will be serialized to JSON) */
  data: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Serialize JSON-LD with safe escaping to prevent script tag injection.
 * `<` is parsed identically by JSON consumers, but can never close the
 * surrounding `<script>` the way a literal `</script>` would.
 */
export function safeJsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Parse a raw JSON-LD string (e.g. a CMS `json_ld` column) into a value that
 * is safe to re-serialise. Returns null for anything that is not valid JSON —
 * an author typo must drop the block, not inject arbitrary markup.
 */
export function parseJsonLd(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

/**
 * Render author-supplied JSON-LD (a string straight from the DB). Round-trips
 * through JSON.parse so only well-formed JSON reaches the page, then applies
 * the same `<` escaping as `StructuredData`. Renders nothing on invalid input.
 */
export function SafeJsonLd({ raw }: { raw: string }) {
  const parsed = parseJsonLd(raw);
  if (parsed === null) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdString(parsed) }}
    />
  );
}
