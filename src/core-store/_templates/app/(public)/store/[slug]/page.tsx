import type { Metadata } from 'next';
import { getServerTranslations } from '@/lib/translations-server';
import { StoreProductDetailClient } from './client';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();

  return {
    title: __('Product Detail'),
    description: __('View product details, select options, and add to cart.'),
    openGraph: {
      title: __('Product Detail'),
      description: __('View product details, select options, and add to cart.'),
      type: 'website',
    },
  };
}

/**
 * /store/[slug] — Server component with metadata.
 * Renders client component for product detail page.
 */
export default function StoreProductPage() {
  return <StoreProductDetailClient />;
}
