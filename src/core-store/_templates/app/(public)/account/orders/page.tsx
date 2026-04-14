'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, ShoppingBag, ChevronRight } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations, dataTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/core-store/lib/store-utils';
import '@/core-store/components/cart/store-cart.css';
import '@/core-store/components/product/store-grid.css';

const _d = dataTranslations('General');

const STATUS_LABELS: Record<string, string> = {
  pending: _d('Pending'),
  processing: _d('Processing'),
  shipped: _d('Shipped'),
  delivered: _d('Delivered'),
  cancelled: _d('Cancelled'),
  refunded: _d('Refunded'),
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  processing: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  shipped: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400',
  refunded: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
};

function formatDate(dateStr: Date | string): string {
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function AccountOrdersPage() {
  const __ = useBlankTranslations();
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.storeOrders.myOrders.useQuery({
    page,
    pageSize: 20,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (!data?.results.length) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">{__('My Orders')}</h1>
        <div className="store-empty">
          <ShoppingBag className="h-12 w-12 store-empty-icon" />
          <p className="store-empty-title">{__('No orders yet')}</p>
          <p className="store-empty-text">
            {__('Once you place an order, it will appear here.')}
          </p>
          <Link
            href="/store"
            className="mt-4 inline-flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            {__('Browse Store')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{__('My Orders')}</h1>

      <div className="space-y-3">
        {data.results.map((order) => (
          <Link
            key={order.id}
            href={`/account/orders/${order.id}`}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-(--surface-secondary) border border-(--border-subtle) p-4 hover:border-(--border-primary) transition-colors"
          >
            <div className="min-w-0">
              <span className="font-semibold text-(--text-primary)">
                #{order.orderNumber}
              </span>
              <span className="text-sm text-(--text-muted) ml-3">
                {formatDate(order.createdAt)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
                  STATUS_COLORS[order.status] ?? '',
                )}
              >
                {__(STATUS_LABELS[order.status] ?? order.status)}
              </span>
              <span className="font-semibold text-(--text-primary) whitespace-nowrap">
                {formatPrice(order.totalCents, order.currency)}
              </span>
              <ChevronRight className="h-4 w-4 text-(--text-muted) shrink-0" />
            </div>
          </Link>
        ))}

        {/* Pagination */}
        {data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-(--border-primary) disabled:opacity-40"
            >
              {__('Previous')}
            </button>
            <span className="text-sm text-(--text-secondary)">
              {__('Page')} {page} {__('of')} {data.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-(--border-primary) disabled:opacity-40"
            >
              {__('Next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
