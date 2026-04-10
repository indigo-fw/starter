import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { serverTRPC } from '@/lib/trpc/server';
import { getServerTranslations } from '@/lib/translations-server';
import { siteConfig } from '@/config/site';
import '@/core-store/components/product/store-grid.css';
import '@/core-store/components/cart/store-cart.css';

import { OrderDetailView, type OrderData } from './OrderDetailView';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const __ = await getServerTranslations();
  return {
    title: `${__('Order Details')} | ${siteConfig.name}`,
  };
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  const __ = await getServerTranslations();

  let order;
  try {
    const api = await serverTRPC();
    order = await api.storeOrders.myOrderDetail({ id });
  } catch {
    notFound();
  }

  return (
    <div className="app-container py-12">
      <OrderDetailView order={order as unknown as OrderData} />
    </div>
  );
}
