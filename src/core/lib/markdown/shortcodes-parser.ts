export interface HtmlSegment {
  type: 'html';
  content: string;
}

export interface ShortcodeSegment {
  type: 'shortcode';
  name: string;
  attrs: Record<string, string>;
  content?: string;
}

export type Segment = HtmlSegment | ShortcodeSegment;

/** Parse shortcode attributes string like `type="info" color="blue"` into a record */
function parseAttrs(attrsStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrsStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/** Split HTML into segments of plain HTML and shortcodes */
export function parseShortcodes(html: string): Segment[] {
  const segments: Segment[] = [];
  // Match paired shortcodes: [name attrs]content[/name]
  // and self-closing: [name attrs /]
  const regex = /\[(\w+)((?:\s+\w+="[^"]*")*)\s*(?:\/(])|]([\s\S]*?)\[\/\1])/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    // Add HTML before this shortcode
    if (match.index > lastIndex) {
      segments.push({ type: 'html', content: html.slice(lastIndex, match.index) });
    }

    const name = match[1];
    const attrsStr = match[2] ?? '';
    const isSelfClosing = match[3] === ']';
    const innerContent = match[4];

    segments.push({
      type: 'shortcode',
      name,
      attrs: parseAttrs(attrsStr),
      content: isSelfClosing ? undefined : innerContent,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining HTML
  if (lastIndex < html.length) {
    segments.push({ type: 'html', content: html.slice(lastIndex) });
  }

  return segments;
}

/** Serialize a shortcode back to string form */
export function serializeShortcode(
  name: string,
  attrs: Record<string, string>,
  content?: string
): string {
  const attrsStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v.replace(/"/g, '&quot;')}"`)
    .join(' ');
  const attrsPart = attrsStr ? ` ${attrsStr}` : '';

  if (content != null) {
    return `[${name}${attrsPart}]${content}[/${name}]`;
  }
  return `[${name}${attrsPart} /]`;
}
