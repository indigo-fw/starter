/**
 * Generate a deterministic placeholder image as a data URI.
 * Uses a simple SVG with product initials and a hue derived from the name.
 */
export function placeholderImage(name: string, size = 600): string {
  // Derive a deterministic hue from the name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;

  // Get initials (max 2 chars)
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="oklch(0.92 0.03 ${hue})"/>
    <rect x="20" y="20" width="${size - 40}" height="${size - 40}" rx="24" fill="oklch(0.96 0.015 ${hue})"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,-apple-system,sans-serif" font-size="${size * 0.2}" font-weight="700" fill="oklch(0.55 0.12 ${hue})">${initials}</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
