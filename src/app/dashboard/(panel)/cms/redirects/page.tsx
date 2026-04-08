'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const CONTENT_TYPES = ['post', 'page', 'category'] as const;

export default function RedirectsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    slug: string;
  } | null>(null);

  // Create form state
  const [newRedirect, setNewRedirect] = useState({
    oldSlug: '',
    contentType: 'post',
    contentId: '',
    urlPrefix: '/',
  });

  const list = trpc.redirects.list.useQuery({
    search: search || undefined,
    page,
    pageSize: 20,
  });

  const createRedirect = trpc.redirects.create.useMutation({
    onSuccess: (data) => {
      toast.success(__('Redirect created'));
      if (data.chain) {
        toast.info(__('Chain detected: {chain}', { chain: data.chain.join(' -> ') }));
      }
      utils.redirects.list.invalidate();
      setShowCreateForm(false);
      setNewRedirect({
        oldSlug: '',
        contentType: 'post',
        contentId: '',
        urlPrefix: '/',
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteRedirect = trpc.redirects.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Redirect deleted'));
      utils.redirects.list.invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const data = list.data;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newRedirect.oldSlug || !newRedirect.contentId) return;
    createRedirect.mutate(newRedirect);
  }

  function formatDate(date: Date | string) {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">
            {__('Redirects')}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="btn btn-primary"
            >
              {showCreateForm ? (
                <>
                  <X className="h-4 w-4" />
                  {__('Cancel')}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {__('New Redirect')}
                </>
              )}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner redirects-page">
      {/* Create Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="redirects-create-form card mt-4 p-4"
        >
          <h2 className="text-lg font-semibold text-(--text-primary)">
            {__('Create Redirect')}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-(--text-secondary)">
                {__('Old Slug')}
              </label>
              <input
                type="text"
                value={newRedirect.oldSlug}
                onChange={(e) =>
                  setNewRedirect((r) => ({ ...r, oldSlug: e.target.value }))
                }
                placeholder={__('e.g. old-page-slug')}
                required
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-(--text-secondary)">
                {__('Content Type')}
              </label>
              <select
                value={newRedirect.contentType}
                onChange={(e) =>
                  setNewRedirect((r) => ({
                    ...r,
                    contentType: e.target.value,
                  }))
                }
                className="select w-full"
              >
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-(--text-secondary)">
                {__('Content ID')}
              </label>
              <input
                type="text"
                value={newRedirect.contentId}
                onChange={(e) =>
                  setNewRedirect((r) => ({ ...r, contentId: e.target.value }))
                }
                placeholder={__('UUID of target content')}
                required
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-(--text-secondary)">
                {__('URL Prefix')}
              </label>
              <input
                type="text"
                value={newRedirect.urlPrefix}
                onChange={(e) =>
                  setNewRedirect((r) => ({ ...r, urlPrefix: e.target.value }))
                }
                placeholder={__('e.g. / or /blog')}
                className="input"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={createRedirect.isPending}
              className="btn btn-primary disabled:opacity-50"
            >
              {createRedirect.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {__('Create')}
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="mt-4 flex gap-2">
        <div className="redirects-search relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={__('Search by slug or content type...')}
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

      {/* Table */}
      <div className="card mt-4 overflow-hidden">
        {list.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (data?.results ?? []).length === 0 ? (
          <p className="py-12 text-center text-sm text-(--text-muted)">
            {search
              ? __('No redirects found.')
              : __('No redirects yet.')}
          </p>
        ) : (
          <table className="w-full">
            <thead className="table-thead">
              <tr>
                <th className="table-th">{__('Old Slug')}</th>
                <th className="table-th">{__('Target')}</th>
                <th className="table-th w-28">{__('Type')}</th>
                <th className="table-th w-24">{__('Prefix')}</th>
                <th className="table-th w-40">{__('Created')}</th>
                <th className="table-th w-16" />
              </tr>
            </thead>
            <tbody>
              {(data?.results ?? []).map((r) => (
                <tr key={r.id} className="hover:bg-(--surface-secondary)">
                  <td className="table-td">
                    <code className="rounded bg-(--surface-secondary) px-1.5 py-0.5 text-xs text-(--text-primary)">
                      {r.oldSlug}
                    </code>
                  </td>
                  <td className="table-td">
                    <div>
                      <p className="text-sm font-medium text-(--text-primary)">
                        {r.targetTitle}
                      </p>
                      {r.targetSlug && (
                        <p className="text-xs text-(--text-muted)">
                          /{r.targetSlug}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="table-td">
                    <span className="inline-block rounded-full bg-(--surface-secondary) px-2 py-0.5 text-xs font-medium text-(--text-secondary)">
                      {r.contentType}
                    </span>
                  </td>
                  <td className="table-td text-xs text-(--text-muted)">
                    {r.urlPrefix}
                  </td>
                  <td className="table-td text-xs text-(--text-muted)">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="table-td">
                    <button
                      onClick={() =>
                        setDeleteTarget({ id: r.id, slug: r.oldSlug })
                      }
                      className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                      title={__('Delete redirect')}
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
        <div className="redirects-pagination mt-4 flex items-center justify-between">
          <p className="pagination-info text-sm text-(--text-muted)">
            {__('Page')} {data.page} {__('of')} {data.totalPages} ({data.total}{' '}
            {__('total')})
          </p>
          <div className="redirects-pagination-buttons flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() =>
                setPage((p) => Math.min(data.totalPages, p + 1))
              }
              disabled={page >= data.totalPages}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={__('Delete redirect?')}
        message={__(
          `Delete the redirect for "${deleteTarget?.slug ?? ''}"? This cannot be undone.`
        )}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            deleteRedirect.mutate({ id: deleteTarget.id });
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div></main>
    </>
  );
}
