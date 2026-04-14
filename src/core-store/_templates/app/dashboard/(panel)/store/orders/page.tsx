'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Loader2,
  Package,
  RotateCcw,
  Search,
  ShoppingCart,
  Truck,
  CheckCircle2,
  X,
  XCircle,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/core-store/lib/store-utils';

type StatusFilter =
  | 'all'
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

const STATUS_TABS: { key: StatusFilter; label: string; icon: typeof Clock }[] = [
  { key: 'all', label: 'All', icon: ShoppingCart },
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'processing', label: 'Processing', icon: Package },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
  { key: 'cancelled', label: 'Cancelled', icon: XCircle },
  { key: 'refunded', label: 'Refunded', icon: XCircle },
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  processing: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  shipped: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',
  delivered: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
  cancelled: 'bg-(--surface-secondary) text-(--text-muted)',
  refunded: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
};

const STAT_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  processing: Package,
  shipped: Truck,
  revenue: ShoppingCart,
};

function fmtDate(date: Date | string | null) {
  if (!date) return '\u2014';
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function StoreOrdersPage() {
  const __ = useAdminTranslations();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [refundTarget, setRefundTarget] = useState<{ id: string; orderNumber: string; totalCents: number; currency: string } | null>(null);
  const [refundReason, setRefundReason] = useState('');

  const orders = trpc.storeOrders.adminList.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize: 20,
  });

  const data = orders.data;

  // Derive stats from current page results
  const stats = useMemo(() => {
    const results = data?.results ?? [];
    const pending = results.filter((o) => o.status === 'pending').length;
    const processing = results.filter((o) => o.status === 'processing').length;
    const shipped = results.filter((o) => o.status === 'shipped').length;
    const revenue = results
      .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
      .reduce((sum, o) => sum + (o.totalCents ?? 0), 0);
    return { pending, processing, shipped, revenue };
  }, [data]);

  const exportOrders = trpc.storeAdminOrders.exportOrders.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.data], { type: data.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const generateInvoice = trpc.storeAdminOrders.generateInvoice.useMutation({
    onSuccess: (data) => {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(data.html);
        win.document.close();
      }
    },
  });

  const refundOrder = trpc.storeAdminOrders.refundOrder.useMutation({
    onSuccess: () => {
      setRefundTarget(null);
      setRefundReason('');
      orders.refetch();
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleExport() {
    exportOrders.mutate({
      format: 'csv',
      status: statusFilter === 'all' ? undefined : statusFilter,
      from: from || undefined,
      to: to || undefined,
    });
  }

  function handleGenerateInvoice(orderId: string) {
    generateInvoice.mutate({ orderId });
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Orders')}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exportOrders.isPending}
              className="btn btn-secondary text-sm"
            >
              {exportOrders.isPending ? __('Exporting...') : __('Export')}
            </button>
            <Link
              href={adminPanel.storeProducts}
              className="btn btn-secondary text-sm"
            >
              {__('Products')} &rarr;
            </Link>
          </div>
        </div>
      </header>
      <main className="dash-main">
        <div className="dash-inner">
          {/* Stats cards */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              { key: 'pending', label: 'Pending', value: String(stats.pending) },
              { key: 'processing', label: 'Processing', value: String(stats.processing) },
              { key: 'shipped', label: 'Shipped', value: String(stats.shipped) },
              { key: 'revenue', label: 'Revenue', value: data ? formatPrice(stats.revenue, 'EUR') || '\u2014' : '\u2014' },
            ] as const).map((s) => {
              const Icon = STAT_ICONS[s.key] ?? ShoppingCart;
              return (
                <div key={s.key} className="card flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--surface-secondary)">
                    <Icon className="h-5 w-5 text-(--text-muted)" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-semibold text-(--text-primary)">{orders.isLoading ? '\u2014' : s.value}</p>
                    <p className="text-xs text-(--text-muted)">{__(s.label)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Status tabs */}
          <div className="mt-6 flex flex-wrap gap-1 border-b border-(--border-primary)">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setStatusFilter(t.key);
                  setPage(1);
                }}
                className={cn(
                  'border-b-2 px-3 pb-2 text-sm font-medium transition-colors',
                  statusFilter === t.key
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-(--text-muted) hover:border-(--border-primary) hover:text-(--text-primary)',
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
                    onClick={() => {
                      setSearch('');
                      setSearchInput('');
                      setPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-secondary)"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button type="submit" className="btn btn-secondary">
                {__('Search')}
              </button>
            </form>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                className="input"
                placeholder={__('From')}
              />
              <span className="text-sm text-(--text-muted)">{__('to')}</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                className="input"
                placeholder={__('To')}
              />
            </div>
          </div>

          {/* Orders table */}
          <div className="card mt-4 overflow-hidden">
            {orders.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
              </div>
            ) : (data?.results ?? []).length === 0 ? (
              <div className="empty-state py-16 text-center">
                <ShoppingCart className="empty-state-icon mx-auto h-12 w-12 text-(--text-muted)" />
                <h3 className="empty-state-title mt-3 text-lg font-semibold text-(--text-primary)">
                  {__('No orders')}
                </h3>
                <p className="empty-state-text mt-1 text-sm text-(--text-muted)">
                  {search
                    ? __('No orders match your search.')
                    : __('No orders yet.')}
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
                      <td className="table-td text-xs text-(--text-muted) truncate max-w-36">
                        {o.placedByUserId}
                      </td>
                      <td className="table-td">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                            STATUS_BADGE[o.status] ??
                              'bg-(--surface-secondary) text-(--text-muted)',
                          )}
                        >
                          {__(o.status)}
                        </span>
                      </td>
                      <td className="table-td text-sm">
                        {formatPrice(o.totalCents, o.currency)}
                      </td>
                      <td className="table-td text-xs text-(--text-muted)">
                        {fmtDate(o.createdAt)}
                      </td>
                      <td className="table-td table-td-actions">
                        <Link
                          href={adminPanel.storeOrderDetail(o.id)}
                          className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-brand-600"
                          title={__('View')}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => handleGenerateInvoice(o.id)}
                          className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-brand-600"
                          title={__('Invoice')}
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        {['processing', 'shipped', 'delivered'].includes(o.status) && (
                          <button
                            onClick={() => setRefundTarget(o)}
                            className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                            title={__('Refund')}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
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
                {__('Page')} {data.page} {__('of')} {data.totalPages} ({data.total}{' '}
                {__('total')})
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
        </div>
      </main>

      {/* Refund Dialog */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-(--text-primary) mb-2">
              {__('Refund Order')} #{refundTarget.orderNumber}
            </h3>
            <p className="text-sm text-(--text-muted) mb-4">
              {__('Total')}: {formatPrice(refundTarget.totalCents, refundTarget.currency) || '\u2014'}
            </p>
            <label className="text-sm font-medium text-(--text-secondary) mb-1 block">
              {__('Reason')} <span className="text-(--text-muted)">({__('optional')})</span>
            </label>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="input w-full mb-4"
              placeholder={__('Enter reason for refund...')}
            />
            {refundOrder.error && (
              <p className="text-sm text-red-600 mb-3">{refundOrder.error.message}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setRefundTarget(null); setRefundReason(''); }}
                className="btn btn-secondary"
                disabled={refundOrder.isPending}
              >
                {__('Cancel')}
              </button>
              <button
                onClick={() => refundOrder.mutate({ orderId: refundTarget.id, reason: refundReason || undefined, notifyCustomer: true })}
                className="btn bg-red-600 text-white hover:bg-red-700"
                disabled={refundOrder.isPending}
              >
                {refundOrder.isPending ? __('Processing...') : __('Refund Order')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
