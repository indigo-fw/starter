'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';

interface SubscriptionsTableProps {
  from?: string;
  to?: string;
  planFilter?: string;
  statusFilter?: string;
}

const PLAN_NAMES: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'badge badge-published';
    case 'trialing':
      return 'badge badge-scheduled';
    case 'past_due':
      return 'badge badge-scheduled';
    case 'canceled':
    case 'unpaid':
      return 'badge badge-draft';
    default:
      return 'badge';
  }
}

export function SubscriptionsTable({ from, to, planFilter, statusFilter }: SubscriptionsTableProps) {
  const __ = useAdminTranslations();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page to 1 when filters change (adjust state during render — React docs pattern)
  const filterKey = `${debouncedSearch}|${planFilter}|${statusFilter}|${pageSize}|${from}|${to}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    if (page !== 1) setPage(1);
  }

  const { data, isLoading } = trpc.billing.listSubscriptions.useQuery({
    page,
    pageSize,
    status: statusFilter || undefined,
    planId: planFilter || undefined,
    from: from || undefined,
    to: to || undefined,
    search: debouncedSearch || undefined,
  });

  const results = data?.results ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const showFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showTo = Math.min(page * pageSize, total);

  return (
    <div className="card overflow-hidden">
      <div className="widget-header">
        <h2 className="font-semibold text-(--text-primary)">{__('Active Subscriptions')}</h2>
      </div>

      {/* Search + page size */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-(--border-primary)">
        <input
          type="text"
          className="search-input max-w-80"
          placeholder={__('Search organizations...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <select
          className="filter-select"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {[10, 20, 50].map((n) => (
            <option key={n} value={n}>{n} {__('per page')}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-8 text-center text-(--text-muted)">{__('Loading...')}</div>
      ) : results.length === 0 ? (
        <div className="empty-state">{__('No subscriptions found.')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{__('Organization')}</th>
                <th className="th">{__('Plan')}</th>
                <th className="th">{__('Status')}</th>
                <th className="th">{__('Provider')}</th>
                <th className="th">{__('Period')}</th>
                <th className="th">{__('Created')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((sub) => (
                <tr key={sub.id} className="tr cursor-pointer" onClick={() => router.push(`/dashboard/organizations?org=${sub.organizationId}`)}>
                  <td className="td">{sub.orgName ?? sub.organizationId}</td>
                  <td className="td">{PLAN_NAMES[sub.planId] ?? sub.planId}</td>
                  <td className="td">
                    <span className={statusBadgeClass(sub.status)}>
                      {sub.status.charAt(0).toUpperCase() + sub.status.slice(1).replace('_', ' ')}
                    </span>
                  </td>
                  <td className="td">{sub.providerId ?? '—'}</td>
                  <td className="td">
                    {sub.currentPeriodStart && sub.currentPeriodEnd
                      ? `${new Date(sub.currentPeriodStart).toLocaleDateString()} – ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
                      : '—'}
                  </td>
                  <td className="td">
                    {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="pagination">
          <span className="text-sm text-(--text-muted)">
            {__('Showing')} {showFrom} {__('to')} {showTo} {__('of')} {total} {__('results')}
          </span>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {__('Previous')}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {__('Next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
