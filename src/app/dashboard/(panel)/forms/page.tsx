'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { adminPanel } from '@/config/routes';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function FormsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const list = trpc.forms.list.useQuery({
    search: search || undefined,
    page,
    pageSize: 20,
  });

  const deleteForm = trpc.forms.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Form deleted'));
      utils.forms.list.invalidate();
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

  function formatDate(date: Date | string) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">
            {__('Forms')}
          </h1>
          <div className="flex items-center gap-2">
            <Link href={adminPanel.formNew} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              {__('New Form')}
            </Link>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner forms-page">
      {/* Search */}
      <form onSubmit={handleSearch} className="mt-4 flex gap-2">
        <div className="forms-search relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={__('Search forms...')}
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
            {search ? __('No forms found.') : __('No forms yet. Create your first form.')}
          </p>
        ) : (
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{__('Name')}</th>
                <th className="th w-40">{__('Slug')}</th>
                <th className="th w-20">{__('Active')}</th>
                <th className="th w-20">{__('Fields')}</th>
                <th className="th w-28">{__('Submissions')}</th>
                <th className="th w-32">{__('Created')}</th>
                <th className="th w-28" />
              </tr>
            </thead>
            <tbody>
              {(data?.results ?? []).map((form) => {
                const fieldCount = Array.isArray(form.fields)
                  ? (form.fields as unknown[]).length
                  : 0;
                return (
                  <tr key={form.id} className="hover:bg-(--surface-secondary)">
                    <td className="td">
                      <Link
                        href={adminPanel.formDetail(form.id)}
                        className="font-medium text-(--text-primary) hover:text-(--color-brand-600)"
                      >
                        {form.name}
                      </Link>
                    </td>
                    <td className="td">
                      <code className="rounded bg-(--surface-secondary) px-1.5 py-0.5 text-xs text-(--text-secondary)">
                        {form.slug}
                      </code>
                    </td>
                    <td className="td">
                      {form.active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                          <Eye className="h-3 w-3" />
                          {__('Yes')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-(--text-muted)">
                          <EyeOff className="h-3 w-3" />
                          {__('No')}
                        </span>
                      )}
                    </td>
                    <td className="td text-sm text-(--text-secondary)">
                      {fieldCount}
                    </td>
                    <td className="td">
                      <Link
                        href={adminPanel.formSubmissions(form.id)}
                        className="text-sm text-(--color-brand-600) hover:underline"
                      >
                        {form.submissionCount}
                      </Link>
                    </td>
                    <td className="td text-xs text-(--text-muted)">
                      {formatDate(form.createdAt)}
                    </td>
                    <td className="td">
                      <div className="forms-row-actions flex items-center justify-end gap-1">
                        <Link
                          href={adminPanel.formDetail(form.id)}
                          className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--color-brand-600)"
                          title={__('Edit form')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() =>
                            setDeleteTarget({ id: form.id, name: form.name })
                          }
                          className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                          title={__('Delete form')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="forms-pagination mt-4 flex items-center justify-between">
          <p className="pagination-info text-sm text-(--text-muted)">
            {__('Page')} {data.page} {__('of')} {data.totalPages} ({data.total}{' '}
            {__('total')})
          </p>
          <div className="forms-pagination-buttons flex gap-1">
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
        title={__('Delete form?')}
        message={__(
          `Delete "${deleteTarget?.name ?? ''}" and all its submissions? This cannot be undone.`
        )}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            deleteForm.mutate({ id: deleteTarget.id });
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div></main>
    </>
  );
}
