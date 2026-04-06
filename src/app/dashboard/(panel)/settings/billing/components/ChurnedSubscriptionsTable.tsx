'use client';

import { useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface ChurnedSubscriptionsTableProps {
  from?: string;
  to?: string;
}

const PLAN_NAMES: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'canceled', label: 'Canceled' },
  { key: 'past_due', label: 'Payment Failed' },
  { key: 'unpaid', label: 'Unpaid' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

function statusBadgeClass(status: string): string {
  if (status === 'past_due') return 'badge badge-scheduled';
  return 'badge badge-draft';
}

export function ChurnedSubscriptionsTable({ from, to }: ChurnedSubscriptionsTableProps) {
  const __ = useAdminTranslations();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page to 1 when filters change (adjust state during render — React docs pattern)
  const filterKey = `${activeTab}|${debouncedSearch}|${pageSize}|${from}|${to}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    if (page !== 1) setPage(1);
  }

  const { data, isLoading } = trpc.billing.listChurned.useQuery({
    page,
    pageSize,
    type: activeTab,
    from: from || undefined,
    to: to || undefined,
    search: debouncedSearch || undefined,
  });

  const canceledCount = data?.typeCounts?.canceled ?? 0;
  const pastDueCount = data?.typeCounts?.past_due ?? 0;
  const unpaidCount = data?.typeCounts?.unpaid ?? 0;
  const allCount = canceledCount + pastDueCount + unpaidCount;

  const tabCounts: Record<TabKey, number> = useMemo(() => ({
    all: allCount,
    canceled: canceledCount,
    past_due: pastDueCount,
    unpaid: unpaidCount,
  }), [allCount, canceledCount, pastDueCount, unpaidCount]);

  const results = data?.results ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const showFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showTo = Math.min(page * pageSize, total);

  const statusLabel = (status: string) => {
    if (status === 'canceled') return __('Canceled');
    if (status === 'past_due') return __('Payment Failed');
    return __('Unpaid');
  };

  return (
    <div className="card overflow-hidden">
      <div className="widget-header">
        <h2 className="font-semibold text-(--text-primary)">{__('Churned Subscriptions')}</h2>
      </div>
      {/* Tab bar */}
      <div className="status-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={cn('status-tab', activeTab === tab.key && 'active')}
            onClick={() => setActiveTab(tab.key)}
          >
            {__(tab.label)} ({tabCounts[tab.key]})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-4 border-b border-(--border-primary)">
        <input
          className="search-input max-w-80"
          type="text"
          placeholder={__('Search by organization...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-8 text-center text-(--text-muted)">{__('Loading...')}</div>
      ) : results.length === 0 ? (
        <div className="empty-state">{__('No churned subscriptions found.')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{__('Organization')}</th>
                <th className="th">{__('Plan')}</th>
                <th className="th">{__('Status')}</th>
                <th className="th">{__('Provider')}</th>
                <th className="th">{__('Churn Date')}</th>
                <th className="th">{__('Subscription Start')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((sub) => (
                <tr key={sub.id} className="tr">
                  <td className="td">{sub.orgName ?? '—'}</td>
                  <td className="td">{PLAN_NAMES[sub.planId] ?? sub.planId}</td>
                  <td className="td">
                    <span className={statusBadgeClass(sub.status)}>
                      {statusLabel(sub.status)}
                    </span>
                  </td>
                  <td className="td">{sub.providerId ?? '—'}</td>
                  <td className="td">
                    {sub.updatedAt ? new Date(sub.updatedAt).toLocaleDateString() : '—'}
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
          <div className="flex items-center gap-2">
            <select
              className="filter-select"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
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
