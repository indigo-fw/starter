const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Extract internal (relative) link URLs from markdown content.
 * Returns deduplicated array of URL paths (e.g. ['/blog/my-post', '/privacy-policy']).
 */
export function extractInternalLinks(markdown: string): string[] {
  const urls = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = MARKDOWN_LINK_RE.exec(markdown)) !== null) {
    const url = match[2];
    // Only relative paths starting with /, skip protocol-relative //
    if (url.startsWith('/') && !url.startsWith('//')) {
      urls.add(url);
    }
  }

  return [...urls];
}
