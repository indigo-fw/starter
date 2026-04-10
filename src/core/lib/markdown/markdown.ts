import TurndownService from 'turndown';
import { gfm as turndownGfm } from 'turndown-plugin-gfm';
import { marked } from 'marked';

// Shortcode regex: [name attrs]content[/name] and [name attrs /]
const SHORTCODE_RE =
  /\[(\w+)((?:\s+\w+="[^"]*")*)\s*(?:\/(])|]([\s\S]*?)\[\/\1])/g;

// ─── HTML → Markdown (turndown) ─────────────────────────────────────────────
//
// Shortcodes in the HTML are raw text like [callout type="info"]...[/callout].
// Turndown would escape the square brackets (markdown link syntax), and it
// strips HTML comments entirely. So we replace shortcodes with <div> placeholders
// that a custom turndown rule converts to restorable text markers.

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// GFM tables + strikethrough (table rule in turndown)
turndown.use(turndownGfm);

// Preserve <u> as inline HTML — markdown has no underline syntax
turndown.keep(['u']);

// Preserve <img> with width or style as raw HTML — markdown ![alt](src) has no width/alignment syntax.
// Plain images (no width, no style) still convert to standard markdown image syntax.
turndown.addRule('styledImage', {
  filter: (node) => {
    if (node.nodeName !== 'IMG') return false;
    return !!(node.getAttribute('width') || node.getAttribute('style'));
  },
  replacement: (_content, node) => {
    return `\n\n${(node as HTMLElement).outerHTML}\n\n`;
  },
});

// Preserve text-aligned elements as raw HTML — markdown has no alignment syntax.
// Uses outerHTML so inner formatting (<strong>, etc.) stays as HTML and round-trips
// correctly through marked. Shortcodes are block-level and can't be inside
// paragraphs, so the outerHTML never contains shortcode placeholders.
turndown.addRule('textAlign', {
  filter: (node) => {
    const style = node.getAttribute('style') ?? '';
    return /text-align:\s*(center|right|justify)/i.test(style);
  },
  replacement: (_content, node) => {
    return `\n\n${(node as HTMLElement).outerHTML}\n\n`;
  },
});

// Convert shortcode placeholder divs to restorable text markers
turndown.addRule('shortcodePlaceholder', {
  filter: (node) =>
    node.nodeName === 'DIV' && node.hasAttribute('data-sc-idx'),
  replacement: (_content, node) => {
    const idx = (node as HTMLElement).getAttribute('data-sc-idx');
    return `\n\n%%SC:${idx}%%\n\n`;
  },
});

export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  const shortcodes: string[] = [];
  const withPlaceholders = html.replace(SHORTCODE_RE, (match) => {
    shortcodes.push(match);
    // Must have text content — turndown's blankRule skips empty elements
    // before custom rules are checked
    return `<div data-sc-idx="${shortcodes.length - 1}">sc</div>`;
  });
  const md = turndown.turndown(withPlaceholders);
  return md.replace(/%%SC:(\d+)%%/g, (_, i) => shortcodes[+i] ?? '');
}

// ─── Markdown → HTML (marked) ───────────────────────────────────────────────
//
// HTML comments survive marked parsing and render as block-level elements when
// on their own line (no <p> wrapping), which is exactly what we want for
// block-level shortcodes.

export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  const shortcodes: string[] = [];
  const withPlaceholders = markdown.replace(SHORTCODE_RE, (match) => {
    shortcodes.push(match);
    return `\n\n<!--SC:${shortcodes.length - 1}-->\n\n`;
  });
  const html = marked.parse(withPlaceholders, { async: false }) as string;
  return html.replace(/<!--SC:(\d+)-->/g, (_, i) => shortcodes[+i] ?? '');
}
