'use client';

import { useMemo } from 'react';
import type { UnifiedDoc } from '@/core-docs/lib/docs-service';

/**
 * GitHub-style admonition parser.
 * Converts `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]` etc. to styled blocks.
 */
function parseAdmonitions(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|WARNING|TIP|IMPORTANT|CAUTION)\]([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
    (_, type: string, content: string) => {
      const t = type.toUpperCase();
      const icon = t === 'WARNING' || t === 'CAUTION' ? '⚠️' : t === 'TIP' ? '💡' : t === 'IMPORTANT' ? '❗' : 'ℹ️';
      return `<div class="docs-admonition docs-admonition-${t.toLowerCase()}" role="note"><p><strong>${icon} ${t}</strong></p>${content}</div>`;
    }
  );
}

interface DocRendererProps {
  doc: UnifiedDoc;
}

/**
 * Renders a documentation page.
 * Handles CMS (HTML), .md (markdown), and .mdx (markdown with components).
 * MDX component rendering requires next-mdx-remote (lazy-loaded when needed).
 */
export function DocRenderer({ doc }: DocRendererProps) {
  const rendered = useMemo(() => {
    if (doc.source === 'cms') {
      // CMS content is already HTML
      return { type: 'html' as const, content: parseAdmonitions(doc.body) };
    }
    // .md and .mdx — render markdown to HTML client-side
    // For a production setup, use next-mdx-remote/serialize on the server
    return { type: 'markdown' as const, content: doc.body };
  }, [doc.body, doc.source]);

  return (
    <article className="docs-content">
      <h1 className="text-3xl font-bold mb-6">{doc.title}</h1>

      {doc.metaDescription && (
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
          {doc.metaDescription}
        </p>
      )}

      {rendered.type === 'html' ? (
        <div
          className="prose dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: rendered.content }}
        />
      ) : (
        <div className="prose dark:prose-invert max-w-none">
          {/* Markdown/MDX: render as pre-formatted for now.
              For production: integrate next-mdx-remote or a markdown-to-HTML pipeline.
              The tRPC endpoint could return pre-rendered HTML from the server. */}
          <div dangerouslySetInnerHTML={{
            __html: markdownToHtmlBasic(rendered.content),
          }} />
        </div>
      )}

      <footer className="mt-12 pt-6 border-t text-sm text-gray-500">
        Last updated: {new Date(doc.updatedAt).toLocaleDateString()}
        {doc.source !== 'cms' && (
          <span className="ml-4">Source: {doc.source} file</span>
        )}
      </footer>
    </article>
  );
}

/**
 * Basic markdown to HTML conversion for client-side rendering.
 * For production, replace with a proper markdown parser (remark/rehype pipeline).
 */
function markdownToHtmlBasic(md: string): string {
  return md
    // Code blocks (must be before other transforms)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Headings
    .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Unordered lists
    .replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>')
    // Paragraphs (lines not already wrapped)
    .replace(/^(?!<[hluop]|<li|<pre|<div|<blockquote)(.+)$/gm, '<p>$1</p>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '');
}
