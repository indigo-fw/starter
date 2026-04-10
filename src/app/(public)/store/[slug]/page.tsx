import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import '@/core-store/components/store-grid.css';
import '@/core-store/components/store-detail.css';

import { ProductDetailClient } from './ProductDetailClient';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const api = await serverTRPC();
    const product = await api.storeProducts.getBySlug({ slug });
    return {
      title: `${product.metaTitle || product.name} | ${siteConfig.name}`,
      description: product.metaDescription || product.shortDescription || product.name,
    };
  } catch {
    return { title: `Product | ${siteConfig.name}` };
  }
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug } = await params;

  let product;
  try {
    const api = await serverTRPC();
    product = await api.storeProducts.getBySlug({ slug });
  } catch {
    notFound();
  }

  return (
    <div className="app-container py-12">
      <ProductDetailClient product={product} />
    </div>
  );
}
