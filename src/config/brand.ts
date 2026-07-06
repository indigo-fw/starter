/**
 * Brand config — single source of truth for project branding.
 *
 * Edit this file, then run `bun run indigo brand:generate` to regenerate
 * favicons, OG images, the web manifest, and the press kit.
 *
 * Pick the mode that matches what assets you have:
 *
 *   'icon+text' — you have a square SVG icon + want the wordmark as live text
 *                 in a chosen font (most common)
 *   'text-only' — no icon, just text. Requires `faviconGlyph` (1–2 char
 *                 abbreviation that becomes the favicon)
 *   'lockup'    — you have one horizontal SVG with icon + text composed.
 *                 Requires either a separate `icon` OR `faviconGlyph` for
 *                 favicons (auto-cropping a lockup is not supported)
 *
 * See `src/core-brand/CLAUDE.md` for details.
 */

import type { BrandConfig } from '@/core-brand/types/brand-config';

export const brand: BrandConfig = {
  name: 'Indigo',
  mode: 'icon+text',

  // Square SVG icon. Path is relative to project root.
  icon: 'src/brand/icon.svg',

  // Live-text wordmark rendered alongside the icon.
  wordmark: {
    text: 'Indigo',
    font: '"Manrope", "Inter", system-ui, sans-serif',
    weight: 700,
    tracking: -0.02,
  },

  // Color palette used by OG image composition + web manifest.
  colors: {
    brand: 'oklch(0.60 0.22 274)',
    bgLight: '#ffffff',
    bgDark: 'oklch(0.13 0.02 260)',
  },

  // OG / Twitter card composition. Default = 'custom-svg' with a bundled
  // 1200×630 SVG. CLI rasterizes it to all three social sizes without
  // needing satori + bundled fonts.
  ogImage: {
    template: 'custom-svg',
    customSvg: 'src/brand/og-image.svg',
    tagline: 'The agent-native SaaS framework for Next.js',
  },

  // /brand page configuration. /press redirects to whatever slug you choose.
  press: {
    enabled: true,
    slug: '/brand',
    contactEmail: 'hello@indigo-fw.dev',
  },
};
