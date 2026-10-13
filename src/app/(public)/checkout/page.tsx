import { CheckoutForm } from './CheckoutForm';
import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';
import { redirect } from '@/i18n/navigation';
import { getLocale } from '@/lib/locale-server';
import { getServerTranslations } from '@/lib/translations-server';
import { serverTRPC } from '@/lib/trpc/server';

import '@/core-store/components/cart/store-cart.css';
import '@/core-store/components/product/store-grid.css';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();
  return {
    title: `${__('Checkout')} | ${siteConfig.name}`,
    description: __('Complete your order'),
    robots: { index: false, follow: true },
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
    redirect({ href: '/cart', locale: await getLocale() });
  }

  return (
    <div className="app-container py-12">
      <h1 className="store-title" style={{ marginBottom: '2rem' }}>
        {__('Checkout')}
      </h1>
      <CheckoutForm />
    </div>
  );
}
