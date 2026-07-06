/**
 * Next.js metadata helper.
 *
 * Returns a partial `Metadata` object the project's `layout.tsx` spreads into
 * its own metadata export. Wires favicons, OG tags, Twitter card metadata
 * based on the generated files. Files are produced by `brand:generate` and
 * live in `public/` — Next.js serves them from `/`.
 *
 * Synchronous — relies on `setBrandConfig()` having been called at boot.
 */

import type { Metadata } from 'next';
import { getBrandConfig } from './get-brand-config';

interface GetBrandMetadataOptions {
  /** Canonical site URL (e.g. https://indigo-fw.dev). Used for absolute OG URLs. */
  siteUrl?: string;
  /** Page title template. Defaults to '%s · {brand.name}'. */
  titleTemplate?: string;
  /** Default description for OG / Twitter cards. */
  description?: string;
}

export function getBrandMetadata(options: GetBrandMetadataOptions = {}): Metadata {
  const brand = getBrandConfig();

  const titleTemplate = options.titleTemplate ?? `%s · ${brand.name}`;
  const description = options.description ?? brand.ogImage?.tagline ?? '';

  return {
    title: {
      default: brand.name,
      template: titleTemplate,
    },
    description,
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: '/apple-icon.png',
    },
    manifest: '/site.webmanifest',
    openGraph: {
      title: brand.name,
      description,
      siteName: brand.name,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: brand.name,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: brand.name,
      description,
      images: ['/twitter-card.png'],
    },
    ...(options.siteUrl ? { metadataBase: new URL(options.siteUrl) } : {}),
  };
}
