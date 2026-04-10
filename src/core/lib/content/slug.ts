/** URL slug: "Hello World!" → "hello-world" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 200);
}

/** Filename slug: "My Photo (1).JPEG" → "my-photo-1.jpeg", preserves underscores */
export function slugifyFilename(filename: string): string {
  const dotIdx = filename.lastIndexOf('.');
  const name = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
  const ext = dotIdx > 0 ? filename.slice(dotIdx + 1).toLowerCase() : '';
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s._-]/g, '')
      .replace(/[.\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'file';
  return ext ? `${slug}.${ext}` : slug;
}
