import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';
import { getServerTranslations } from '@/lib/translations-server';
import '@/core-store/components/store-grid.css';
import '@/core-store/components/store-cart.css';

import { CartPageClient } from './CartPageClient';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();
  return {
    title: `${__('Cart')} | ${siteConfig.name}`,
    description: __('Your shopping cart'),
  };
}

export default async function CartPage() {
  const __ = await getServerTranslations();
  return (
    <div className="app-container py-12">
      <h1 className="store-title" style={{ marginBottom: '2rem' }}>{__('Shopping Cart')}</h1>
      <CartPageClient />
    </div>
  );
}
