import { Extension, Mark, Node } from '@tiptap/core';

/** ProseMirror nodeNames considered block-level when classifying div children. */
const BLOCK_TAG_NAMES = new Set([
  'DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE',
  'FIGURE', 'FIGCAPTION', 'SECTION', 'ARTICLE', 'ASIDE',
  'HEADER', 'FOOTER', 'MAIN', 'NAV', 'HR',
]);

function divHasBlockChildren(el: HTMLElement): boolean {
  for (const child of Array.from(el.children)) {
    if (BLOCK_TAG_NAMES.has(child.tagName)) return true;
  }
  return false;
}

/**
 * `<div>` wrapping other blocks — cards, grids, hero containers.
 * Preserves `class` + `style` on round-trip.
 *
 * Content model: `block+`. Divs whose children are inline-only (e.g.
 * `<div class="text-6xl">40%</div>`) match the sibling `HtmlInlineDivNode`
 * instead, avoiding Tiptap's auto-wrap into `<div><p>40%</p></div>`.
 */
export const HtmlDivNode = Node.create({
  name: 'htmlDiv',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
        renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
      },
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attrs) => (attrs.style ? { style: attrs.style } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div',
        getAttrs: (element) =>
          divHasBlockChildren(element as HTMLElement) ? null : false,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes, 0];
  },
});

/**
 * `<div>` wrapping inline content only (text, spans, links).
 * Separate from `HtmlDivNode` so Tiptap doesn't auto-wrap "40%" into a
 * `<p>` — which would change the rendered styling under prose and silently
 * rewrite the saved markdown source. Higher parse priority (51 > default 50)
 * runs before HtmlDivNode and short-circuits when the div has no block-level
 * children.
 */
export const HtmlInlineDivNode = Node.create({
  name: 'htmlInlineDiv',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
        renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
      },
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attrs) => (attrs.style ? { style: attrs.style } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div',
        priority: 51,
        getAttrs: (element) =>
          divHasBlockChildren(element as HTMLElement) ? false : null,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes, 0];
  },
});

/**
 * Generic `<span>` mark — preserves inline pills/badges from promo content
 * (e.g. rounded-full pill spans). Implemented as a Mark (not a Node) because
 * spans decorate existing text; a Mark survives StarterKit's paragraph/heading
 * parsers and round-trips cleanly through Turndown.
 */
export const HtmlSpanMark = Mark.create({
  name: 'htmlSpan',

  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
        renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
      },
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attrs) => (attrs.style ? { style: attrs.style } : {}),
      },
    };
  },

  parseHTML() {
    // Skip the content-variable span — that's handled by ContentVariableNode
    return [
      {
        tag: 'span',
        getAttrs: (element) => {
          if ((element as HTMLElement).hasAttribute('data-content-variable')) {
            return false;
          }
          return null;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
});

/**
 * Adds `class` + `style` attributes to paragraph and heading nodes so
 * Tailwind classes on `<p class="text-center">` or `<h2 class="...">` in
 * CMS content survive the Tiptap round-trip. Without this, StarterKit's
 * default paragraph/heading nodes drop unknown attributes silently.
 */
export const ClassStylePreserver = Extension.create({
  name: 'classStylePreserver',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          class: {
            default: null,
            parseHTML: (element) => element.getAttribute('class'),
            renderHTML: (attrs) =>
              attrs.class ? { class: attrs.class } : {},
          },
          style: {
            default: null,
            parseHTML: (element) => element.getAttribute('style'),
            renderHTML: (attrs) =>
              attrs.style ? { style: attrs.style } : {},
          },
        },
      },
    ];
  },
});
