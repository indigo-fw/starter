'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/core-store/lib/store-utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type StatusFilter = 'all' | 'draft' | 'published' | 'archived';
type TypeFilter = 'all' | 'simple' | 'variable' | 'digital' | 'subscription';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Draft' },
  { key: 'archived', label: 'Archived' },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'simple', label: 'Simple' },
  { value: 'variable', label: 'Variable' },
  { value: 'digital', label: 'Digital' },
  { value: 'subscription', label: 'Subscription' },
];

const TYPE_BADGE: Record<string, string> = {
  simple: 'bg-(--surface-secondary) text-(--text-secondary)',
  variable: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  digital: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
  subscription: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',
};

export default function StoreProductsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const products = trpc.storeProducts.adminList.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    type: typeFilter === 'all' ? undefined : typeFilter,
    search: search || undefined,
    page,
    pageSize: 20,
  });

  const deleteProduct = trpc.storeProducts.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Product deleted'));
      utils.storeProducts.adminList.invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const data = products.data;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <Link
              href={adminPanel.storeOrders}
              className="text-sm text-(--text-muted) hover:text-(--text-primary)"
            >
              &larr; {__('Orders')}
            </Link>
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('Products')}</h1>
          </div>
          <Link href={adminPanel.storeProductNew} className="btn btn-primary">
            <Plus className="h-4 w-4" />
            {__('Add Product')}
          </Link>
        </div>
      </header>
      <main className="dash-main">
        <div className="dash-inner">
          {/* Status tabs */}
          <div className="mt-4 flex gap-1 border-b border-(--border-primary)">
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

          {/* Filters row */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form onSubmit={handleSearch} className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={__('Search products...')}
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
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as TypeFilter);
                setPage(1);
              }}
              className="filter-select"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {__(o.label)}
                </option>
              ))}
            </select>
          </div>

          {/* Products table */}
          <div className="card mt-4 overflow-hidden">
            {products.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
              </div>
            ) : (data?.results ?? []).length === 0 ? (
              <div className="empty-state py-16 text-center">
                <Package className="empty-state-icon mx-auto h-12 w-12 text-(--text-muted)" />
                <h3 className="empty-state-title mt-3 text-lg font-semibold text-(--text-primary)">
                  {__('No products')}
                </h3>
                <p className="empty-state-text mt-1 text-sm text-(--text-muted)">
                  {search
                    ? __('No products match your search.')
                    : __('Create your first product to get started.')}
                </p>
                {!search && (
                  <Link
                    href={adminPanel.storeProductNew}
                    className="btn btn-primary mt-4 inline-flex"
                  >
                    <Plus className="h-4 w-4" />
                    {__('Add Product')}
                  </Link>
                )}
              </div>
            ) : (
              <table className="w-full">
                <thead className="table-thead">
                  <tr>
                    <th className="table-th w-12" />
                    <th className="table-th">{__('Name')}</th>
                    <th className="table-th w-28">{__('Type')}</th>
                    <th className="table-th w-28">{__('Price')}</th>
                    <th className="table-th w-24">{__('Status')}</th>
                    <th className="table-th w-20">{__('Stock')}</th>
                    <th className="table-th w-24" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.results ?? []).map((p) => (
                    <tr key={p.id} className="table-tr hover:bg-(--surface-secondary)">
                      <td className="table-td">
                        {p.featuredImage ? (
                          <Image
                            src={p.featuredImage}
                            alt=""
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-(--surface-secondary)">
                            <Package className="h-4 w-4 text-(--text-muted)" />
                          </div>
                        )}
                      </td>
                      <td className="table-td table-td-primary">
                        <Link
                          href={adminPanel.storeProductDetail(p.id)}
                          className="font-medium text-(--text-primary) hover:text-brand-600 hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.sku && (
                          <p className="text-xs text-(--text-muted)">{p.sku}</p>
                        )}
                      </td>
                      <td className="table-td">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                            TYPE_BADGE[p.type] ??
                              'bg-(--surface-secondary) text-(--text-secondary)',
                          )}
                        >
                          {__(p.type)}
                        </span>
                      </td>
                      <td className="table-td text-sm">
                        {p.type === 'variable'
                          ? `${__('From')} ${formatPrice(p.priceCents, p.currency) || '\u2014'}`
                          : formatPrice(p.priceCents, p.currency) || '\u2014'}
                      </td>
                      <td className="table-td">
                        <span
                          className={cn(
                            'badge',
                            p.status === 'published' && 'badge-published',
                            p.status === 'draft' && 'badge-draft',
                            p.status === 'archived' &&
                              'bg-(--surface-secondary) text-(--text-muted)',
                          )}
                        >
                          {__(p.status.charAt(0).toUpperCase() + p.status.slice(1))}
                        </span>
                      </td>
                      <td className="table-td text-sm text-(--text-secondary)">
                        {p.trackInventory ? p.stockQuantity : '\u221E'}
                      </td>
                      <td className="table-td table-td-actions">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={adminPanel.storeProductDetail(p.id)}
                            className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-brand-600"
                            title={__('Edit')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                            className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                            title={__('Delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
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

          <ConfirmDialog
            open={!!deleteTarget}
            title={__('Delete product?')}
            message={__(
              'Delete "{name}"? This action cannot be undone.',
              { name: deleteTarget?.name ?? '' },
            )}
            confirmLabel={__('Delete')}
            variant="danger"
            onConfirm={() => {
              if (deleteTarget) deleteProduct.mutate({ id: deleteTarget.id });
            }}
            onCancel={() => setDeleteTarget(null)}
          />
        </div>
      </main>
    </>
  );
}
