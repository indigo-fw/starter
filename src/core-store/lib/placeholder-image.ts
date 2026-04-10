/**
 * Generate a deterministic placeholder image as a data URI.
 * Creates an abstract geometric pattern with product initials — unique per product name.
 */
export function placeholderImage(name: string, size = 600): string {
  // Deterministic hash from name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const abs = Math.abs(hash);
  const hue = abs % 360;
  const hue2 = (hue + 40) % 360;

  // Initials
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  // Deterministic shape positions from hash
  const s = size;
  const cx1 = (abs % 7 + 2) * (s / 10);
  const cy1 = ((abs >> 4) % 5 + 1) * (s / 8);
  const r1 = s * 0.25 + (abs % 30);
  const cx2 = s - (abs % 5 + 2) * (s / 10);
  const cy2 = s - ((abs >> 8) % 4 + 1) * (s / 8);
  const r2 = s * 0.2 + ((abs >> 3) % 25);
  const rx3 = s * 0.15 + (abs % 20);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="oklch(0.94 0.03 ${hue})"/>
      <stop offset="100%" stop-color="oklch(0.90 0.04 ${hue2})"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>
  <circle cx="${cx1}" cy="${cy1}" r="${r1}" fill="oklch(0.85 0.06 ${hue})" opacity="0.6"/>
  <circle cx="${cx2}" cy="${cy2}" r="${r2}" fill="oklch(0.80 0.08 ${hue2})" opacity="0.4"/>
  <rect x="${s * 0.6}" y="${s * 0.1}" width="${rx3}" height="${rx3}" rx="${rx3 * 0.3}" fill="oklch(0.88 0.05 ${hue})" opacity="0.5" transform="rotate(${abs % 45} ${s * 0.65} ${s * 0.15})"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,-apple-system,sans-serif" font-size="${s * 0.16}" font-weight="800" letter-spacing="${s * 0.01}" fill="oklch(0.45 0.12 ${hue})" opacity="0.7">${initials}</text>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
