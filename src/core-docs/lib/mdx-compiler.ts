import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeStringify from 'rehype-stringify';
import type { Root, Element, ElementContent } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * Rehype plugin that transforms custom MDX JSX elements into semantic HTML.
 *
 * Handles: <Callout>, <CodeTabs>/<Tab>, <Steps>/<Step>, <Badge>
 * Converts JSX nodes (mdxJsxFlowElement and mdxJsxTextElement) into plain
 * HTML elements with CSS classes, so the result is a self-contained HTML string.
 */
function rehypeMdxComponents() {
  return (tree: Root) => {
    // Visit both block-level and inline MDX JSX elements
    for (const nodeType of ['mdxJsxFlowElement', 'mdxJsxTextElement'] as const) {
      visit(tree, nodeType, (node: any, index, parent) => {
        if (!parent || index == null) return;

        const replacement = transformMdxNode(node);
        if (replacement) {
          (parent as any).children[index] = replacement;
        }
      });
    }
  };
}

/** Transform an MDX JSX node into an HTML element, or return null if unrecognized. */
function transformMdxNode(node: any): Element | null {
  switch (node.name) {
    case 'Callout': {
      const type = getAttr(node, 'type') ?? 'info';
      const icons: Record<string, string> = { info: '\u2139\uFE0F', warning: '\u26A0\uFE0F', tip: '\uD83D\uDCA1', danger: '\u274C' };
      return h('div', { class: `docs-callout docs-callout-${type}`, role: 'note' }, [
        h('p', { class: 'docs-callout-title' }, [
          h('strong', {}, [text(`${icons[type] ?? icons.info} ${type.charAt(0).toUpperCase() + type.slice(1)}`)]),
        ]),
        h('div', { class: 'docs-callout-body' }, node.children as ElementContent[]),
      ]);
    }

    case 'CodeTabs':
      return h('div', { class: 'docs-code-tabs' }, node.children as ElementContent[]);

    case 'Tab': {
      const label = getAttr(node, 'label') ?? '';
      return h('div', { class: 'docs-tab', 'data-tab-label': label }, [
        h('button', { class: 'docs-tab-button', type: 'button' }, [text(label)]),
        h('div', { class: 'docs-tab-content' }, node.children as ElementContent[]),
      ]);
    }

    case 'Steps':
      return h('ol', { class: 'docs-steps' }, node.children as ElementContent[]);

    case 'Step': {
      const title = getAttr(node, 'title') ?? '';
      return h('li', { class: 'docs-step' }, [
        h('strong', { class: 'docs-step-title' }, [text(title)]),
        h('div', { class: 'docs-step-body' }, node.children as ElementContent[]),
      ]);
    }

    case 'Badge': {
      const variant = getAttr(node, 'variant') ?? 'default';
      return h('span', { class: `docs-badge docs-badge-${variant}` }, node.children as ElementContent[]);
    }

    default:
      // Unknown JSX elements: wrap children in a span so they don't crash the serializer.
      // The component name is lost, but content is preserved.
      if (node.name) {
        return h('span', { 'data-mdx-component': node.name }, node.children as ElementContent[]);
      }
      return null;
  }
}

/** Get a string attribute from an MDX JSX node. */
function getAttr(node: any, name: string): string | undefined {
  const attr = node.attributes?.find((a: any) => a.name === name);
  return attr?.value ?? undefined;
}

/** Create an hast element node. */
function h(tag: string, props: Record<string, string>, children: ElementContent[]): Element {
  return {
    type: 'element',
    tagName: tag,
    properties: props,
    children,
  };
}

/** Create a text node. */
function text(value: string): ElementContent {
  return { type: 'text', value };
}

/** Markdown processor (no MDX JSX support needed). */
const mdProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeSlug)
  .use(rehypeAutolinkHeadings, { behavior: 'wrap' })
  .use(rehypeStringify, { allowDangerousHtml: true });

/** MDX processor (parses JSX tags, transforms them to HTML). */
const mdxProcessor = unified()
  .use(remarkParse)
  .use(remarkMdx)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true, passThrough: ['mdxJsxFlowElement', 'mdxJsxTextElement'] })
  .use(rehypeMdxComponents)
  .use(rehypeSlug)
  .use(rehypeAutolinkHeadings, { behavior: 'wrap' })
  .use(rehypeStringify, { allowDangerousHtml: true });

/**
 * LRU compilation cache.
 * Keyed on `slug:format:mtime` — serves cached HTML until the source file changes.
 * Max 200 entries (~50KB avg HTML per doc = ~10MB worst case).
 */
const COMPILE_CACHE_MAX = 200;
const _compileCache = new Map<string, string>();

function getCached(key: string): string | undefined {
  const val = _compileCache.get(key);
  if (val !== undefined) {
    // Move to end (most recently used)
    _compileCache.delete(key);
    _compileCache.set(key, val);
  }
  return val;
}

function setCache(key: string, html: string) {
  if (_compileCache.size >= COMPILE_CACHE_MAX) {
    // Evict oldest (first key)
    const oldest = _compileCache.keys().next().value;
    if (oldest !== undefined) _compileCache.delete(oldest);
  }
  _compileCache.set(key, html);
}

/** Clear the compilation cache (useful after editing docs via AI agent). */
export function invalidateCompileCache(): void {
  _compileCache.clear();
}

/**
 * Compile markdown or MDX source to HTML string.
 * Uses a unified remark→rehype pipeline. MDX JSX elements are transformed
 * to semantic HTML with CSS classes — no React runtime needed.
 *
 * Results are cached by slug + format + mtime. Pass `cacheKey` to enable
 * caching (typically `slug:format:mtime`). Without it, compiles every time.
 */
export async function compileMarkdownToHtml(
  source: string,
  format: 'md' | 'mdx' = 'md',
  cacheKey?: string,
): Promise<string> {
  if (cacheKey) {
    const cached = getCached(cacheKey);
    if (cached !== undefined) return cached;
  }

  try {
    const processor = format === 'mdx' ? mdxProcessor : mdProcessor;
    const result = await processor.process(source);
    const html = String(result);
    if (cacheKey) setCache(cacheKey, html);
    return html;
  } catch (err) {
    console.error('[docs] Markdown compilation failed:', err);
    return `<div class="docs-compile-error"><p><strong>Error compiling document</strong></p><pre>${escapeHtml(String(err))}</pre></div>`;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
