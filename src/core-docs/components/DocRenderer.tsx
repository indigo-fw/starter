import type { RenderedDoc } from '@/core-docs/lib/docs-service';

/**
 * GitHub-style admonition parser.
 * Converts `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]` etc. to styled blocks.
 */
function parseAdmonitions(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|WARNING|TIP|IMPORTANT|CAUTION)\]([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
    (_, type: string, content: string) => {
      const t = type.toUpperCase();
      const icon = t === 'WARNING' || t === 'CAUTION' ? '\u26A0\uFE0F' : t === 'TIP' ? '\uD83D\uDCA1' : t === 'IMPORTANT' ? '\u2757' : '\u2139\uFE0F';
      return `<div class="docs-admonition docs-admonition-${t.toLowerCase()}" role="note"><p><strong>${icon} ${t}</strong></p>${content}</div>`;
    }
  );
}

interface DocRendererProps {
  doc: RenderedDoc;
}

/**
 * Renders a documentation page.
 * All sources (CMS, .md, .mdx) provide pre-rendered HTML via `renderedBody`.
 */
export function DocRenderer({ doc }: DocRendererProps) {
  const html = parseAdmonitions(doc.renderedBody);

  return (
    <article className="docs-content">
      <h1 className="text-3xl font-bold mb-6">{doc.title}</h1>

      {doc.metaDescription && (
        <p className="text-lg mb-8 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {doc.metaDescription}
        </p>
      )}

      <div
        className="prose dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <footer className="mt-12 pt-6 border-t text-sm" style={{ color: 'var(--text-muted)' }}>
        Last updated: {new Date(doc.updatedAt).toLocaleDateString()}
        {doc.source !== 'cms' && (
          <span className="ml-4">Source: {doc.source} file</span>
        )}
      </footer>
    </article>
  );
}
