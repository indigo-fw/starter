'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  approved: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
  rejected: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
};

function fmtDate(date: Date | string | null) {
  if (!date) return '\u2014';
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, i) => (i < rating ? '\u2605' : '\u2606')).join('');
}

export default function StoreReviewsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const reviews = trpc.storeReviews.adminList.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    pageSize: 20,
  });

  const moderate = trpc.storeReviews.moderate.useMutation({
    onSuccess: () => {
      utils.storeReviews.adminList.invalidate();
    },
  });

  const deleteMutation = trpc.storeReviews.adminDelete.useMutation({
    onSuccess: () => {
      utils.storeReviews.adminList.invalidate();
    },
  });

  const data = reviews.data;

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
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('Reviews')}</h1>
          </div>
        </div>
      </header>
      <main className="dash-main">
        <div className="dash-inner">
          {/* Status tabs */}
          <div className="mt-4 flex flex-wrap gap-1 border-b border-(--border-primary)">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'pending', label: 'Pending' },
                { key: 'approved', label: 'Approved' },
                { key: 'rejected', label: 'Rejected' },
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

          {/* Table */}
          <div className="card mt-4 overflow-hidden">
            {reviews.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
              </div>
            ) : (data?.results ?? []).length === 0 ? (
              <div className="empty-state py-16 text-center">
                <MessageSquare className="empty-state-icon mx-auto h-12 w-12 text-(--text-muted)" />
                <h3 className="empty-state-title mt-3 text-lg font-semibold text-(--text-primary)">
                  {__('No reviews to moderate')}
                </h3>
                <p className="empty-state-text mt-1 text-sm text-(--text-muted)">
                  {statusFilter !== 'all'
                    ? __('No reviews with this status.')
                    : __('Reviews will appear here once customers submit them.')}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="table-thead">
                  <tr>
                    <th className="table-th">{__('Product')}</th>
                    <th className="table-th w-28">{__('Rating')}</th>
                    <th className="table-th">{__('Title')}</th>
                    <th className="table-th w-24">{__('Status')}</th>
                    <th className="table-th w-28">{__('Date')}</th>
                    <th className="table-th w-28" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.results ?? []).map((r) => (
                    <tr key={r.id} className="table-tr hover:bg-(--surface-secondary)">
                      <td className="table-td table-td-primary">
                        <span className="font-medium text-(--text-primary)">
                          {r.productName}
                        </span>
                      </td>
                      <td className="table-td">
                        <span className="text-yellow-500 text-sm tracking-tight" title={`${r.rating}/5`}>
                          {renderStars(r.rating)}
                        </span>
                      </td>
                      <td className="table-td text-sm text-(--text-secondary) truncate max-w-48">
                        {r.title || '\u2014'}
                      </td>
                      <td className="table-td">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                            STATUS_BADGE[r.status] ?? 'bg-(--surface-secondary) text-(--text-muted)',
                          )}
                        >
                          {__(r.status)}
                        </span>
                      </td>
                      <td className="table-td text-xs text-(--text-muted)">
                        {fmtDate(r.createdAt)}
                      </td>
                      <td className="table-td table-td-actions">
                        {r.status === 'pending' && (
                          <>
                            <button
                              onClick={() => moderate.mutate({ id: r.id, status: 'approved' })}
                              disabled={moderate.isPending}
                              className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-green-600"
                              title={__('Approve')}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => moderate.mutate({ id: r.id, status: 'rejected' })}
                              disabled={moderate.isPending}
                              className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                              title={__('Reject')}
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => deleteMutation.mutate({ id: r.id })}
                          disabled={deleteMutation.isPending}
                          className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                          title={__('Delete')}
                        >
                          <Trash2 className="h-4 w-4" />
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
