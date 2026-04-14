import type { Metadata } from 'next';
import { getServerTranslations } from '@/lib/translations-server';
import { StorePageClient } from './client';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();

  return {
    title: __('Store'),
    description: __('Browse our collection of products. Find exactly what you need.'),
    openGraph: {
      title: __('Store'),
      description: __('Browse our collection of products. Find exactly what you need.'),
      type: 'website',
    },
  };
}

/**
 * /store — Server component with metadata.
 * Renders client component for interactive store browsing.
 */
export default function StorePage() {
  return <StorePageClient />;
}
