import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { serverTRPC } from '@/lib/trpc/server';
import { siteConfig } from '@/config/site';
import { getLocale } from '@/lib/locale-server';
import '@/core-store/components/product/store-grid.css';
import '@/core-store/components/product/store-detail.css';

import { StoreProductDetailClient } from './client';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  try {
    const api = await serverTRPC();
    const product = await api.storeProducts.getBySlug({ slug });
    return {
      title: `${product.metaTitle || product.name} | ${siteConfig.name}`,
      description: product.metaDescription || product.shortDescription || product.name,
      openGraph: { locale },
    };
  } catch {
    return { title: `Product | ${siteConfig.name}` };
  }
}

/**
 * /store/[slug] — Server component with product-aware metadata.
 * Fetches product server-side for SEO, then renders the client component.
 */
export default async function StoreProductPage({ params }: Props) {
  const { slug } = await params;

  try {
    const api = await serverTRPC();
    await api.storeProducts.getBySlug({ slug });
  } catch {
    notFound();
  }

  return (
    <div className="app-container py-12">
      <StoreProductDetailClient />
    </div>
  );
}
