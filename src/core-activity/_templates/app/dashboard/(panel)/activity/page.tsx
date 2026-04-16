'use client';

import { useState, useMemo } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/core/lib/infra/datetime';
import { ActivityItem } from '@/core-activity/components/ActivityItem';
import '@/core-activity/styles/activity.css';

type ActionFilter = 'all' | 'post' | 'comment' | 'order' | 'user';
type TargetTypeFilter = 'all' | 'post' | 'page' | 'order' | 'user' | 'comment';

const ACTION_TABS: { key: ActionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'post', label: 'Posts' },
  { key: 'comment', label: 'Comments' },
  { key: 'order', label: 'Orders' },
  { key: 'user', label: 'Users' },
];

const TARGET_TYPE_OPTIONS: { value: TargetTypeFilter; label: string }[] = [
  { value: 'all', label: 'All Targets' },
  { value: 'post', label: 'Posts' },
  { value: 'page', label: 'Pages' },
  { value: 'order', label: 'Orders' },
  { value: 'user', label: 'Users' },
  { value: 'comment', label: 'Comments' },
];

function fmtDate(date: Date | string | null) {
  if (!date) return '\u2014';
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ActivityLogPage() {
  const __ = useAdminTranslations();

  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [targetTypeFilter, setTargetTypeFilter] = useState<TargetTypeFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  // Build action filter: 'post' → matches 'post.created', 'post.published', etc.
  // We pass the prefix and the router does eq() on the full action string.
  // Since the router uses eq(), we'll leave this as undefined for prefix-based filtering
  // and filter client-side for the action category tabs.
  const events = trpc.activity.adminFeed.useQuery({
    action: undefined, // We filter by category client-side via the action prefix
    targetType: targetTypeFilter === 'all' ? undefined : targetTypeFilter,
    page,
    pageSize: 25,
  });

  const data = events.data;

  // Client-side filter for action prefix (tabs)
  const filteredResults = useMemo(() => {
    const results = data?.results ?? [];
    if (actionFilter === 'all') return results;
    return results.filter((e) => e.action.startsWith(actionFilter + '.'));
  }, [data?.results, actionFilter]);

  // Derive stat counts from current page
  const stats = useMemo(() => {
    const results = data?.results ?? [];
    const posts = results.filter((e) => e.action.startsWith('post.')).length;
    const comments = results.filter((e) => e.action.startsWith('comment.')).length;
    const orders = results.filter((e) => e.action.startsWith('order.')).length;
    const users = results.filter((e) => e.action.startsWith('user.')).length;
    return { posts, comments, orders, users, total: data?.total ?? 0 };
  }, [data]);

  const STAT_CARDS = [
    { key: 'total', label: 'Total Events', value: stats.total, icon: Activity },
    { key: 'posts', label: 'Post Events', value: stats.posts, icon: TrendingUp },
    { key: 'comments', label: 'Comment Events', value: stats.comments, icon: Clock },
    { key: 'users', label: 'User Events', value: stats.users, icon: TrendingUp },
  ] as const;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Activity Log')}</h1>
        </div>
      </header>
      <main className="dash-main">
        <div className="dash-inner">
          {/* Stat cards */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAT_CARDS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.key} className="card flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--surface-secondary)">
                    <Icon className="h-5 w-5 text-(--text-muted)" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-semibold text-(--text-primary)">
                      {events.isLoading ? '\u2014' : String(s.value)}
                    </p>
                    <p className="text-xs text-(--text-muted)">{__(s.label)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action category tabs */}
          <div className="mt-6 flex flex-wrap gap-1 border-b border-(--border-primary)">
            {ACTION_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setActionFilter(t.key);
                  setPage(1);
                }}
                className={cn(
                  'border-b-2 px-3 pb-2 text-sm font-medium transition-colors',
                  actionFilter === t.key
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
                  placeholder={__('Search by actor name...')}
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
              value={targetTypeFilter}
              onChange={(e) => {
                setTargetTypeFilter(e.target.value as TargetTypeFilter);
                setPage(1);
              }}
              className="filter-select"
            >
              {TARGET_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {__(o.label)}
                </option>
              ))}
            </select>
          </div>

          {/* Events table */}
          <div className="card mt-4 overflow-hidden">
            {events.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="empty-state py-16 text-center">
                <Activity className="empty-state-icon mx-auto h-12 w-12 text-(--text-muted)" />
                <h3 className="empty-state-title mt-3 text-lg font-semibold text-(--text-primary)">
                  {__('No activity events')}
                </h3>
                <p className="empty-state-text mt-1 text-sm text-(--text-muted)">
                  {search
                    ? __('No events match your filters.')
                    : __('Activity events will appear here as users interact with the app.')}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="table-thead">
                  <tr>
                    <th className="table-th w-52">{__('Actor')}</th>
                    <th className="table-th">{__('Action')}</th>
                    <th className="table-th w-44">{__('Target')}</th>
                    <th className="table-th w-36">{__('Time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((event) => (
                    <tr key={event.id} className="table-tr hover:bg-(--surface-secondary)">
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          {event.actorImage ? (
                            <img
                              src={event.actorImage}
                              alt=""
                              className="h-7 w-7 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-(--surface-secondary) text-xs font-medium text-(--text-muted)">
                              {(event.actorName ?? 'S')[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-(--text-primary) truncate">
                              {event.actorName ?? (event.actorType === 'system' ? __('System') : __('Unknown'))}
                            </p>
                            {event.actorEmail && (
                              <p className="text-xs text-(--text-muted) truncate">{event.actorEmail}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="table-td">
                        <span className="inline-block rounded-full bg-(--surface-secondary) px-2 py-0.5 text-xs font-medium text-(--text-secondary)">
                          {event.action}
                        </span>
                      </td>
                      <td className="table-td">
                        {event.targetLabel ? (
                          <span className="text-sm text-(--text-primary)">
                            {event.targetLabel}
                          </span>
                        ) : (
                          <span className="text-sm text-(--text-muted)">{'\u2014'}</span>
                        )}
                        {event.targetType && (
                          <p className="text-xs text-(--text-muted)">{event.targetType}</p>
                        )}
                      </td>
                      <td className="table-td text-xs text-(--text-muted)">
                        <span title={fmtDate(event.createdAt)}>
                          {formatRelativeTime(event.createdAt)}
                        </span>
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
