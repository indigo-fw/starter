import { marked } from 'marked';

// Shortcode regex: [name attrs]content[/name] and [name attrs /]
const SHORTCODE_RE =
  /\[(\w+)((?:\s+\w+="[^"]*")*)\s*(?:\/(])|]([\s\S]*?)\[\/\1])/g;

// ─── HTML → Markdown (turndown) ─────────────────────────────────────────────
//
// Lazy-initialized: turndown + GFM plugin only loaded when htmlToMarkdown()
// is first called (admin editor only). This avoids bundling turndown in
// public-facing pages that only use markdownToHtml().

let turndownInstance: import('turndown') | null = null;

async function getTurndown() {
  if (turndownInstance) return turndownInstance;
  const [{ default: TurndownService }, { gfm }] = await Promise.all([
    import('turndown'),
    import('turndown-plugin-gfm'),
  ]);

  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  td.use(gfm);
  td.keep(['u']);

  td.addRule('styledImage', {
    filter: (node) => {
      if (node.nodeName !== 'IMG') return false;
      return !!(node.getAttribute('width') || node.getAttribute('style'));
    },
    replacement: (_content, node) => {
      return `\n\n${(node as HTMLElement).outerHTML}\n\n`;
    },
  });

  td.addRule('textAlign', {
    filter: (node) => {
      const style = node.getAttribute('style') ?? '';
      return /text-align:\s*(center|right|justify)/i.test(style);
    },
    replacement: (_content, node) => {
      return `\n\n${(node as HTMLElement).outerHTML}\n\n`;
    },
  });

  td.addRule('shortcodePlaceholder', {
    filter: (node) =>
      node.nodeName === 'DIV' && node.hasAttribute('data-sc-idx'),
    replacement: (_content, node) => {
      const idx = (node as HTMLElement).getAttribute('data-sc-idx');
      return `\n\n%%SC:${idx}%%\n\n`;
    },
  });

  turndownInstance = td;
  return td;
}

export async function htmlToMarkdown(html: string): Promise<string> {
  if (!html) return '';
  const shortcodes: string[] = [];
  const withPlaceholders = html.replace(SHORTCODE_RE, (match) => {
    shortcodes.push(match);
    return `<div data-sc-idx="${shortcodes.length - 1}">sc</div>`;
  });
  const td = await getTurndown();
  const md = td.turndown(withPlaceholders);
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
