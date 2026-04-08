'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search, X } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';

const ENTITY_TYPES = ['', 'post', 'category', 'tag', 'menu', 'media'] as const;
const ACTIONS = ['', 'create', 'update', 'delete', 'restore', 'publish', 'unpublish', 'duplicate'] as const;

export default function ActivityPage() {
  const __ = useAdminTranslations();
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userSearchInput, setUserSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const auditQuery = trpc.audit.list.useQuery({
    entityType: entityType || undefined,
    action: action || undefined,
    userSearch: userSearch || undefined,
    page,
    pageSize: 20,
  });

  const data = auditQuery.data;

  function formatDate(date: Date | string) {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function handleUserSearch(e: React.FormEvent) {
    e.preventDefault();
    setUserSearch(userSearchInput);
    setPage(1);
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Activity Log')}</h1>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner activity-page">
      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
          className="select"
        >
          <option value="">{__('All types')}</option>
          {ENTITY_TYPES.slice(1).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          className="select"
        >
          <option value="">{__('All actions')}</option>
          {ACTIONS.slice(1).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* User search */}
        <form onSubmit={handleUserSearch} className="flex gap-1">
          <div className="activity-search relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-muted)" />
            <input
              type="text"
              value={userSearchInput}
              onChange={(e) => setUserSearchInput(e.target.value)}
              placeholder={__('Filter by user...')}
              className="input w-48 pl-8 pr-7"
            />
            {userSearch && (
              <button
                type="button"
                onClick={() => {
                  setUserSearch('');
                  setUserSearchInput('');
                  setPage(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-secondary)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button type="submit" className="btn btn-secondary text-sm">
            {__('Search')}
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="mt-4 card overflow-hidden">
        {auditQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (data?.results ?? []).length === 0 ? (
          <p className="py-12 text-center text-sm text-(--text-muted)">
            {__('No activity recorded yet.')}
          </p>
        ) : (
          <table className="w-full">
            <thead className="table-thead">
              <tr>
                <th className="table-th w-36">{__('Time')}</th>
                <th className="table-th w-24">{__('Action')}</th>
                <th className="table-th w-36">{__('User')}</th>
                <th className="table-th w-24">{__('Type')}</th>
                <th className="table-th">{__('Entity')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.results ?? []).map((entry) => (
                <tr key={entry.id} className="hover:bg-(--surface-secondary)">
                  <td className="table-td text-xs text-(--text-muted)">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="table-td">
                    <span className="inline-block rounded-full bg-(--surface-secondary) px-2 py-0.5 text-xs font-medium text-(--text-secondary)">
                      {entry.action}
                    </span>
                  </td>
                  <td className="table-td text-xs text-(--text-muted)">
                    {entry.userName ?? entry.userEmail ?? '\u2014'}
                  </td>
                  <td className="table-td text-xs text-(--text-muted)">{entry.entityType}</td>
                  <td className="table-td text-sm text-(--text-primary)">
                    {entry.entityTitle ?? entry.entityId.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="activity-pagination mt-4 flex items-center justify-between">
          <p className="pagination-info text-sm text-(--text-muted)">
            {__('Page')} {data.page} {__('of')} {data.totalPages}
          </p>
          <div className="activity-pagination-buttons flex gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(Math.min(data.totalPages, page + 1))}
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
