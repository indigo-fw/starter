import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';
import { getServerTranslations } from '@/lib/translations-server';
import '@/core-store/components/store.css';

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
      <h1 className="text-3xl font-bold text-(--text-primary) mb-8">{__('Shopping Cart')}</h1>
      <CartPageClient />
    </div>
  );
}
