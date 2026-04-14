'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  processing: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  shipped: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',
  delivered: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
  cancelled: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  refunded: 'bg-(--surface-secondary) text-(--text-muted)',
};

function formatPrice(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function formatDate(date: Date | string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function OrdersPage() {
  const __ = useAdminTranslations();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const orders = trpc.storeOrders.adminList.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: 20,
  });

  const data = orders.data;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Orders')}</h1>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
        {/* Status tabs */}
        <div className="mt-4 flex flex-wrap gap-1 border-b border-(--border-primary)">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setStatusFilter(t.key); setPage(1); }}
              className={cn(
                'border-b-2 px-3 pb-2 text-sm font-medium transition-colors',
                statusFilter === t.key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-(--text-muted) hover:border-(--border-primary) hover:text-(--text-primary)'
              )}
            >
              {__(t.label)}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearch} className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={__('Search by order number...')}
                className="input pl-9 pr-3"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-secondary)"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button type="submit" className="btn btn-secondary">{__('Search')}</button>
          </form>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className="input"
              placeholder={__('From')}
            />
            <span className="text-sm text-(--text-muted)">{__('to')}</span>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className="input"
              placeholder={__('To')}
            />
          </div>
        </div>

        {/* Table */}
        <div className="card mt-4 overflow-hidden">
          {orders.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
            </div>
          ) : (data?.results ?? []).length === 0 ? (
            <div className="empty-state py-16 text-center">
              <ShoppingCart className="empty-state-icon mx-auto h-12 w-12 text-(--text-muted)" />
              <h3 className="empty-state-title mt-3 text-lg font-semibold text-(--text-primary)">{__('No orders')}</h3>
              <p className="empty-state-text mt-1 text-sm text-(--text-muted)">
                {search ? __('No orders match your search.') : __('No orders yet.')}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="table-thead">
                <tr>
                  <th className="table-th">{__('Order #')}</th>
                  <th className="table-th w-36">{__('Customer')}</th>
                  <th className="table-th w-28">{__('Status')}</th>
                  <th className="table-th w-28">{__('Total')}</th>
                  <th className="table-th w-32">{__('Date')}</th>
                  <th className="table-th w-16" />
                </tr>
              </thead>
              <tbody>
                {(data?.results ?? []).map((o) => (
                  <tr key={o.id} className="table-tr hover:bg-(--surface-secondary)">
                    <td className="table-td table-td-primary">
                      <Link
                        href={adminPanel.storeOrderDetail(o.id)}
                        className="font-medium text-(--text-primary) hover:text-brand-600 hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="table-td text-xs text-(--text-muted) truncate max-w-36">{o.placedByUserId}</td>
                    <td className="table-td">
                      <span className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                        STATUS_BADGE[o.status] ?? 'bg-(--surface-secondary) text-(--text-muted)',
                      )}>
                        {__(o.status)}
                      </span>
                    </td>
                    <td className="table-td text-sm">{formatPrice(o.totalCents, o.currency)}</td>
                    <td className="table-td text-xs text-(--text-muted)">{formatDate(o.createdAt)}</td>
                    <td className="table-td table-td-actions">
                      <Link
                        href={adminPanel.storeOrderDetail(o.id)}
                        className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-brand-600"
                        title={__('View')}
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="pagination text-sm text-(--text-muted)">
              {__('Page')} {data.page} {__('of')} {data.totalPages} ({data.total} {__('total')})
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-secondary disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="btn btn-secondary disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div></main>
    </>
  );
}
