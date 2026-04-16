'use client';

import { useState } from 'react';
import {
  MessageSquare,
  Search,
  Check,
  X,
  AlertTriangle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'spam';

const STATUS_MAP = { pending: 0, approved: 1, rejected: 2, spam: 3 } as const;

const STATUS_TABS: { key: StatusFilter; label: string; countKey: StatusFilter }[] = [
  { key: 'all', label: 'All', countKey: 'all' },
  { key: 'pending', label: 'Pending', countKey: 'pending' },
  { key: 'approved', label: 'Approved', countKey: 'approved' },
  { key: 'rejected', label: 'Rejected', countKey: 'rejected' },
  { key: 'spam', label: 'Spam', countKey: 'spam' },
];

const STATUS_BADGE: Record<number, string> = {
  0: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  1: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
  2: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  3: 'bg-(--surface-secondary) text-(--text-muted)',
};

const STATUS_LABEL: Record<number, string> = {
  0: 'Pending',
  1: 'Approved',
  2: 'Rejected',
  3: 'Spam',
};

export default function CommentsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; preview: string } | null>(null);

  const statusCounts = trpc.comments.statusCounts.useQuery();

  const comments = trpc.comments.adminList.useQuery({
    status: statusFilter === 'all' ? undefined : STATUS_MAP[statusFilter],
    search: search || undefined,
    page,
    pageSize: 20,
  });

  const updateStatus = trpc.comments.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(__('Comment updated'));
      utils.comments.adminList.invalidate();
      utils.comments.statusCounts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const adminDelete = trpc.comments.adminDelete.useMutation({
    onSuccess: () => {
      toast.success(__('Comment deleted'));
      utils.comments.adminList.invalidate();
      utils.comments.statusCounts.invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const data = comments.data;
  const counts = statusCounts.data;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  }

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('Comments')}</h1>
          </div>
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
                {counts && (
                  <span className="ml-1.5 text-xs text-(--text-muted)">
                    ({counts[t.countKey]})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search row */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form onSubmit={handleSearch} className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={__('Search comments...')}
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
          </div>

          {/* Comments table */}
          <div className="card mt-4 overflow-hidden">
            {comments.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
              </div>
            ) : (data?.results ?? []).length === 0 ? (
              <div className="empty-state py-16 text-center">
                <MessageSquare className="empty-state-icon mx-auto h-12 w-12 text-(--text-muted)" />
                <h3 className="empty-state-title mt-3 text-lg font-semibold text-(--text-primary)">
                  {__('No comments')}
                </h3>
                <p className="empty-state-text mt-1 text-sm text-(--text-muted)">
                  {search
                    ? __('No comments match your search.')
                    : __('No comments found.')}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="table-thead">
                  <tr>
                    <th className="table-th">{__('Author')}</th>
                    <th className="table-th">{__('Comment')}</th>
                    <th className="table-th w-28">{__('Target')}</th>
                    <th className="table-th w-24">{__('Status')}</th>
                    <th className="table-th w-36">{__('Date')}</th>
                    <th className="table-th w-32" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.results ?? []).map((c) => (
                    <tr key={c.id} className="table-tr hover:bg-(--surface-secondary)">
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--surface-secondary) text-xs font-semibold text-(--text-muted)">
                            {c.userImage ? (
                              <img
                                src={c.userImage}
                                alt=""
                                className="h-7 w-7 rounded-full object-cover"
                              />
                            ) : (
                              (c.userName ?? c.authorName ?? '?').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-(--text-primary)">
                              {c.userName ?? c.authorName ?? __('Anonymous')}
                            </p>
                            {c.userEmail && (
                              <p className="truncate text-xs text-(--text-muted)">{c.userEmail}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="table-td table-td-primary">
                        <p className="text-sm text-(--text-secondary)">
                          {truncate(c.content, 100)}
                        </p>
                      </td>
                      <td className="table-td">
                        <span className="text-xs text-(--text-muted)">
                          {c.targetType}
                        </span>
                      </td>
                      <td className="table-td">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                            STATUS_BADGE[c.status] ?? 'bg-(--surface-secondary) text-(--text-muted)',
                          )}
                        >
                          {__(STATUS_LABEL[c.status] ?? 'Unknown')}
                        </span>
                      </td>
                      <td className="table-td text-xs text-(--text-muted)">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="table-td table-td-actions">
                        <div className="flex items-center justify-end gap-0.5">
                          {c.status !== 1 && (
                            <button
                              onClick={() => updateStatus.mutate({ id: c.id, status: 1 })}
                              className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-500/10"
                              title={__('Approve')}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          {c.status !== 2 && (
                            <button
                              onClick={() => updateStatus.mutate({ id: c.id, status: 2 })}
                              className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                              title={__('Reject')}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                          {c.status !== 3 && (
                            <button
                              onClick={() => updateStatus.mutate({ id: c.id, status: 3 })}
                              className="action-btn rounded p-1.5 text-(--text-muted) hover:bg-yellow-50 hover:text-yellow-600 dark:hover:bg-yellow-500/10"
                              title={__('Spam')}
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget({ id: c.id, preview: truncate(c.content, 50) })}
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
            title={__('Delete comment?')}
            message={__(
              'Permanently delete this comment? This action cannot be undone.',
            )}
            confirmLabel={__('Delete')}
            variant="danger"
            onConfirm={() => {
              if (deleteTarget) adminDelete.mutate({ id: deleteTarget.id });
            }}
            onCancel={() => setDeleteTarget(null)}
          />
        </div>
      </main>
    </>
  );
}
