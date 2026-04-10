/**
 * Transform shortcode syntax to/from HTML wrapper divs for Tiptap.
 *
 * Storage format: [callout type="info"]content[/callout]
 * Editor format:  <div data-shortcode="callout" data-shortcode-attrs='{"type":"info"}' data-shortcode-content="content"></div>
 */

/** Convert shortcode syntax → HTML wrappers (before loading into editor) */
export function prepareForEditor(html: string): string {
  // Paired shortcodes: [name attrs]content[/name]
  let result = html.replace(
    /\[(\w+)((?:\s+\w+="[^"]*")*)\s*]([\s\S]*?)\[\/\1]/g,
    (_match, name: string, attrsStr: string, content: string) => {
      const attrs = parseAttrsToJson(attrsStr);
      return `<div data-shortcode="${name}" data-shortcode-attrs='${attrs}' data-shortcode-content="${escapeHtml(content)}"></div>`;
    }
  );

  // Self-closing shortcodes: [name attrs /]
  result = result.replace(
    /\[(\w+)((?:\s+\w+="[^"]*")*)\s*\/]/g,
    (_match, name: string, attrsStr: string) => {
      const attrs = parseAttrsToJson(attrsStr);
      return `<div data-shortcode="${name}" data-shortcode-attrs='${attrs}' data-shortcode-content=""></div>`;
    }
  );

  return result;
}

/** Convert HTML wrappers → shortcode syntax (before saving to DB) */
export function serializeForStorage(html: string): string {
  // Match the data-shortcode div wrappers. Attribute values may be HTML-encoded
  // by the browser's DOM serializer (e.g. " → &quot;), so we use a permissive
  // capture and decode after.
  return html.replace(
    /<div[^>]*\bdata-shortcode="(\w+)"[^>]*\bdata-shortcode-attrs="([^"]*)"[^>]*\bdata-shortcode-content="([^"]*)"[^>]*><\/div>/g,
    (_match, name: string, rawAttrsJson: string, rawContent: string) => {
      // Decode HTML entities that the DOM serializer may have added
      const attrsJson = unescapeHtml(rawAttrsJson);
      const attrs = JSON.parse(attrsJson || '{}') as Record<string, string>;
      const attrsStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      const attrsPart = attrsStr ? ` ${attrsStr}` : '';
      const content = unescapeHtml(rawContent);

      if (content) {
        return `[${name}${attrsPart}]${content}[/${name}]`;
      }
      return `[${name}${attrsPart} /]`;
    }
  );
}

function parseAttrsToJson(attrsStr: string): string {
  const attrs: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrsStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  return JSON.stringify(attrs);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
