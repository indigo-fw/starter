import { getScopedKey } from '@/core/lib/infra/scope';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeStringify from 'rehype-stringify';
import type { Root, Element, ElementContent } from 'hast';
import type { MdxJsxAttribute, MdxJsxExpressionAttribute, MdxJsxFlowElementHast, MdxJsxTextElementHast } from 'mdast-util-mdx-jsx';
import type { Parent } from 'unist';
import { visit } from 'unist-util-visit';
import { resolveContentVars } from '@/core/lib/content/vars';

// ─── MDX Component Registry ────────────────────────────────────────────────

/** An MDX JSX node as seen by the rehype plugin (hast tree). */
type MdxJsxNode = MdxJsxFlowElementHast | MdxJsxTextElementHast;

/** Attribute array from MDX JSX nodes. */
type MdxJsxAttributes = Array<MdxJsxAttribute | MdxJsxExpressionAttribute>;

/**
 * An MDX component transform: receives the JSX node, returns an hast Element.
 * Return null to skip (falls through to unknown-component fallback).
 */
export type MdxComponentTransform = (
  node: { name: string; attributes: MdxJsxAttributes; children: ElementContent[] },
  helpers: { h: typeof h; text: typeof text; getAttr: typeof getAttr },
) => Element | null;

const _componentRegistry = new Map<string, MdxComponentTransform>();

/**
 * Register a custom MDX component transform.
 * Called at startup by modules/project to add JSX components available in .mdx files.
 *
 * Example:
 *   registerMdxComponent('Callout', (node, { h, text, getAttr }) => {
 *     const type = getAttr(node, 'type') ?? 'info';
 *     return h('div', { class: `callout callout-${type}` }, node.children);
 *   });
 */
export function registerMdxComponent(name: string, transform: MdxComponentTransform): void {
  _componentRegistry.set(name, transform);
}

/** Get all registered component names (for documentation/debugging). */
export function getRegisteredMdxComponents(): string[] {
  return [..._componentRegistry.keys()];
}

// ─── Built-in Components ────────────────────────────────────────────────────

registerMdxComponent('Callout', (node, { h, text, getAttr }) => {
  const type = getAttr(node, 'type') ?? 'info';
  const icons: Record<string, string> = { info: '\u2139\uFE0F', warning: '\u26A0\uFE0F', tip: '\uD83D\uDCA1', danger: '\u274C' };
  return h('div', { class: `docs-callout docs-callout-${type}`, role: 'note' }, [
    h('p', { class: 'docs-callout-title' }, [
      h('strong', {}, [text(`${icons[type] ?? icons.info} ${type.charAt(0).toUpperCase() + type.slice(1)}`)]),
    ]),
    h('div', { class: 'docs-callout-body' }, node.children),
  ]);
});

registerMdxComponent('CodeTabs', (node, { h }) =>
  h('div', { class: 'docs-code-tabs' }, node.children));

registerMdxComponent('Tab', (node, { h, text, getAttr }) => {
  const label = getAttr(node, 'label') ?? '';
  return h('div', { class: 'docs-tab', 'data-tab-label': label }, [
    h('button', { class: 'docs-tab-button', type: 'button' }, [text(label)]),
    h('div', { class: 'docs-tab-content' }, node.children),
  ]);
});

registerMdxComponent('Steps', (node, { h }) =>
  h('ol', { class: 'docs-steps' }, node.children));

registerMdxComponent('Step', (node, { h, text, getAttr }) => {
  const title = getAttr(node, 'title') ?? '';
  return h('li', { class: 'docs-step' }, [
    h('strong', { class: 'docs-step-title' }, [text(title)]),
    h('div', { class: 'docs-step-body' }, node.children),
  ]);
});

registerMdxComponent('Badge', (node, { h, getAttr }) => {
  const variant = getAttr(node, 'variant') ?? 'default';
  return h('span', { class: `docs-badge docs-badge-${variant}` }, node.children);
});

// ─── Rehype Plugin ──────────────────────────────────────────────────────────

/**
 * Rehype plugin that transforms custom MDX JSX elements into semantic HTML
 * using the component registry.
 */
function rehypeMdxComponents() {
  return (tree: Root) => {
    const helpers = { h, text, getAttr };
    for (const nodeType of ['mdxJsxFlowElement', 'mdxJsxTextElement'] as const) {
      visit(tree, nodeType, (node: MdxJsxNode, index, parent: Parent | undefined) => {
        if (!parent || index == null) return;

        const { name } = node;
        if (!name) return;

        const transform = _componentRegistry.get(name);
        let replacement: Element | null = null;

        if (transform) {
          replacement = transform(
            { name, attributes: node.attributes, children: node.children },
            helpers,
          );
        } else {
          // Unknown: wrap in span to prevent serializer crash
          replacement = h('span', { 'data-mdx-component': name }, node.children);
        }

        if (replacement) {
          parent.children[index] = replacement;
        }
      });
    }
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get a string attribute from an MDX JSX node. */
export function getAttr(node: { attributes?: MdxJsxAttributes }, name: string): string | undefined {
  const attr = node.attributes?.find((a): a is MdxJsxAttribute => a.type === 'mdxJsxAttribute' && a.name === name);
  return typeof attr?.value === 'string' ? attr.value : undefined;
}

/** Create an hast element node. */
export function h(tag: string, props: Record<string, string>, children: ElementContent[]): Element {
  return { type: 'element', tagName: tag, properties: props, children };
}

/** Create a text node. */
export function text(value: string): ElementContent {
  return { type: 'text', value };
}

// ─── Processors ─────────────────────────────────────────────────────────────

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

// ─── Cache ──────────────────────────────────────────────────────────────────

const COMPILE_CACHE_MAX = 200;
const _compileCache = new Map<string, string>();

function getCached(key: string): string | undefined {
  const val = _compileCache.get(key);
  if (val !== undefined) {
    _compileCache.delete(key);
    _compileCache.set(key, val);
  }
  return val;
}

function setCache(key: string, html: string) {
  if (_compileCache.size >= COMPILE_CACHE_MAX) {
    const oldest = _compileCache.keys().next().value;
    if (oldest !== undefined) _compileCache.delete(oldest);
  }
  _compileCache.set(key, html);
}

/** Clear the compilation cache. */
export function invalidateCompileCache(): void {
  _compileCache.clear();
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compile MDX source to HTML string.
 * Resolves [[VAR]] content variables before compilation.
 * Uses a unified remark→rehype pipeline. MDX JSX elements are transformed
 * to semantic HTML via the component registry — no React runtime needed.
 */
export async function compileMdx(
  source: string,
  cacheKey?: string,
): Promise<string> {
  const scopedCacheKey = cacheKey ? getScopedKey(cacheKey) : undefined;
  if (scopedCacheKey) {
    const cached = getCached(scopedCacheKey);
    if (cached !== undefined) return cached;
  }

  try {
    const resolved = resolveContentVars(source);
    const result = await mdxProcessor.process(resolved);
    const html = String(result);
    if (scopedCacheKey) setCache(scopedCacheKey, html);
    return html;
  } catch (err) {
    console.error('[mdx] Compilation failed:', err);
    return `<div class="docs-compile-error"><p><strong>Error compiling document</strong></p><pre>${escapeHtml(String(err))}</pre></div>`;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
