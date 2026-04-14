'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/core-store/lib/store-utils';

type StatusFilter = 'all' | 'active' | 'inactive';

function fmtDate(date: Date | string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function StoreDiscountsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [formValue, setFormValue] = useState('');
  const [formMinOrder, setFormMinOrder] = useState('');
  const [formMaxUses, setFormMaxUses] = useState('');
  const [formExpiry, setFormExpiry] = useState('');

  const discounts = trpc.storeDiscounts.adminList.useQuery({
    search: search || undefined,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
    page,
    pageSize: 20,
  });

  const create = trpc.storeDiscounts.create.useMutation({
    onSuccess: () => {
      resetForm();
      utils.storeDiscounts.adminList.invalidate();
    },
  });

  const deleteMutation = trpc.storeDiscounts.delete.useMutation({
    onSuccess: () => {
      utils.storeDiscounts.adminList.invalidate();
    },
  });

  function resetForm() {
    setShowForm(false);
    setFormCode('');
    setFormType('percentage');
    setFormValue('');
    setFormMinOrder('');
    setFormMaxUses('');
    setFormExpiry('');
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(formValue);
    if (!formCode.trim() || isNaN(value)) return;

    create.mutate({
      code: formCode.trim().toUpperCase(),
      type: formType,
      value,
      minOrderCents: formMinOrder ? Math.round(parseFloat(formMinOrder) * 100) : undefined,
      maxUses: formMaxUses ? parseInt(formMaxUses, 10) : undefined,
      expiresAt: formExpiry ? new Date(formExpiry).toISOString() : undefined,
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  const data = discounts.data;

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <Link
              href={adminPanel.storeProducts}
              className="text-(--text-muted) hover:text-(--text-primary) transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('Discount Codes')}</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary text-sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            {__('Add Code')}
          </button>
        </div>
      </header>
      <main className="dash-main">
        <div className="dash-inner">
          {/* Add form */}
          {showForm && (
            <form onSubmit={handleCreate} className="card mt-4 p-4">
              <h3 className="text-sm font-semibold text-(--text-primary) mb-3">
                {__('New Discount Code')}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-(--text-secondary) mb-1 block">
                    {__('Code')}
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="SUMMER20"
                    className="input w-full font-mono uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-(--text-secondary) mb-1 block">
                    {__('Type')}
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as 'percentage' | 'fixed_amount')}
                    className="input w-full"
                  >
                    <option value="percentage">{__('Percentage')}</option>
                    <option value="fixed_amount">{__('Fixed Amount')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-(--text-secondary) mb-1 block">
                    {formType === 'percentage' ? __('Value (%)') : __('Value (EUR)')}
                  </label>
                  <input
                    type="number"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder={formType === 'percentage' ? '10' : '5.00'}
                    min="0"
                    step={formType === 'percentage' ? '1' : '0.01'}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-(--text-secondary) mb-1 block">
                    {__('Min Order (EUR)')} <span className="text-(--text-muted)">({__('optional')})</span>
                  </label>
                  <input
                    type="number"
                    value={formMinOrder}
                    onChange={(e) => setFormMinOrder(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-(--text-secondary) mb-1 block">
                    {__('Max Uses')} <span className="text-(--text-muted)">({__('optional')})</span>
                  </label>
                  <input
                    type="number"
                    value={formMaxUses}
                    onChange={(e) => setFormMaxUses(e.target.value)}
                    placeholder="\u221E"
                    min="1"
                    step="1"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-(--text-secondary) mb-1 block">
                    {__('Expires')} <span className="text-(--text-muted)">({__('optional')})</span>
                  </label>
                  <input
                    type="date"
                    value={formExpiry}
                    onChange={(e) => setFormExpiry(e.target.value)}
                    className="input w-full"
                  />
                </div>
              </div>
              {create.error && (
                <p className="text-sm text-red-600 mt-3">{create.error.message}</p>
              )}
              <div className="flex gap-2 mt-4">
                <button type="submit" disabled={create.isPending} className="btn btn-primary text-sm">
                  {create.isPending ? __('Saving...') : __('Save')}
                </button>
                <button type="button" onClick={resetForm} className="btn btn-secondary text-sm">
                  {__('Cancel')}
                </button>
              </div>
            </form>
          )}

          {/* Filters */}
          <div className="mt-4 flex flex-wrap gap-1 border-b border-(--border-primary)">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'active', label: 'Active' },
                { key: 'inactive', label: 'Inactive' },
              ] as const
            ).map((t) => (
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

          <div className="mt-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={__('Search codes...')}
                  className="input pl-9 pr-3 w-full"
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
          </div>

          {/* Table */}
          <div className="card mt-4 overflow-hidden">
            {discounts.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
              </div>
            ) : (data?.results ?? []).length === 0 ? (
              <div className="empty-state py-16 text-center">
                <Tag className="empty-state-icon mx-auto h-12 w-12 text-(--text-muted)" />
                <h3 className="empty-state-title mt-3 text-lg font-semibold text-(--text-primary)">
                  {__('No discount codes')}
                </h3>
                <p className="empty-state-text mt-1 text-sm text-(--text-muted)">
                  {search
                    ? __('No codes match your search.')
                    : __('Create your first discount code to offer promotions.')}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="table-thead">
                  <tr>
                    <th className="table-th">{__('Code')}</th>
                    <th className="table-th w-24">{__('Type')}</th>
                    <th className="table-th w-24">{__('Value')}</th>
                    <th className="table-th w-28">{__('Min Order')}</th>
                    <th className="table-th w-24">{__('Usage')}</th>
                    <th className="table-th w-20">{__('Status')}</th>
                    <th className="table-th w-28">{__('Expires')}</th>
                    <th className="table-th w-20" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.results ?? []).map((d) => (
                    <tr key={d.id} className="table-tr hover:bg-(--surface-secondary)">
                      <td className="table-td table-td-primary">
                        <span className="font-mono font-semibold text-(--text-primary)">
                          {d.code}
                        </span>
                      </td>
                      <td className="table-td">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                            d.type === 'percentage'
                              ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400'
                              : 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
                          )}
                        >
                          {d.type === 'percentage' ? __('Percent') : __('Fixed')}
                        </span>
                      </td>
                      <td className="table-td text-sm text-(--text-primary)">
                        {d.type === 'percentage'
                          ? `${d.value}%`
                          : formatPrice(Math.round(d.value * 100), 'EUR')}
                      </td>
                      <td className="table-td text-sm text-(--text-muted)">
                        {d.minOrderCents
                          ? formatPrice(d.minOrderCents, 'EUR')
                          : '\u2014'}
                      </td>
                      <td className="table-td text-sm text-(--text-muted)">
                        {d.usedCount} / {d.maxUses ?? '\u221E'}
                      </td>
                      <td className="table-td">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                            d.isActive
                              ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                              : 'bg-(--surface-secondary) text-(--text-muted)',
                          )}
                        >
                          {d.isActive ? __('Active') : __('Inactive')}
                        </span>
                      </td>
                      <td className="table-td text-xs text-(--text-muted)">
                        {fmtDate(d.expiresAt) ?? __('Never')}
                      </td>
                      <td className="table-td table-td-actions">
                        <button
                          onClick={() =>
                            deleteMutation.mutate({ id: d.id })
                          }
                          disabled={deleteMutation.isPending}
                          className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                          title={d.isActive ? __('Deactivate') : __('Delete')}
                        >
                          {d.isActive ? (
                            <ToggleRight className="h-4 w-4" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
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
    </>
  );
}
