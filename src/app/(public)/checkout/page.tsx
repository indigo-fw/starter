import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerTranslations } from '@/lib/translations-server';
import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import '@/core-store/components/product/store-grid.css';
import '@/core-store/components/cart/store-cart.css';

import { CheckoutForm } from './CheckoutForm';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();
  return {
    title: `${__('Checkout')} | ${siteConfig.name}`,
    description: __('Complete your order'),
  };
}

export default async function CheckoutPage() {
  const __ = await getServerTranslations();

  // Check if user has a cart with items (server-side)
  let hasItems = false;
  try {
    const api = await serverTRPC();
    const cart = await api.storeCart.get({});
    hasItems = (cart?.itemCount ?? 0) > 0;
  } catch {
    // Not logged in or no cart — redirect
  }

  if (!hasItems) {
    redirect('/cart');
  }

  return (
    <div className="app-container py-12">
      <h1 className="store-title" style={{ marginBottom: '2rem' }}>{__('Checkout')}</h1>
      <CheckoutForm />
    </div>
  );
}
