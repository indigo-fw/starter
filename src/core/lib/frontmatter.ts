/**
 * Simple YAML-style frontmatter parser for .mdx files.
 * Handles: strings, numbers, booleans, and single-line arrays [a, b, c].
 * Does NOT handle multi-line values, nested objects, or block scalars.
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  raw: string,
): { frontmatter: T; content: string } {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { frontmatter: {} as T, content: raw };

  const frontmatter: Record<string, unknown> = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: string = line.slice(colonIdx + 1).trim();

    // Empty value
    if (!value) continue;

    // Arrays: [tag1, tag2, "tag three"]
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }

    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Booleans
    if (value === 'true') { frontmatter[key] = true; continue; }
    if (value === 'false') { frontmatter[key] = false; continue; }

    // Numbers (integers only)
    if (/^\d+$/.test(value)) { frontmatter[key] = parseInt(value, 10); continue; }

    frontmatter[key] = value;
  }

  return { frontmatter: frontmatter as T, content: match[2] };
}
