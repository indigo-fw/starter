'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { useConfirm } from '@/core/hooks';

export default function AuthorsListPage() {
  const __ = useAdminTranslations();
  const confirm = useConfirm();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const authors = trpc.authors.list.useQuery({ page, pageSize: 20, search: search || undefined });
  const deleteMutation = trpc.authors.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Author deleted'));
      authors.refetch();
    },
  });

  return (
    <div className="dash-container">
      <div className="dash-header">
        <h1 className="dash-title">{__('Authors')}</h1>
        <button
          onClick={() => router.push('/dashboard/authors/new')}
          className="btn btn-primary rounded-lg px-4 py-2 text-sm font-semibold inline-flex items-center gap-1.5"
        >
          <Plus size={16} /> {__('New Author')}
        </button>
      </div>

      <div className="dash-toolbar">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={__('Search authors...')}
          className="input w-64 text-sm"
        />
      </div>

      <div className="dash-main">
        <div className="dash-inner">
          {authors.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
            </div>
          ) : (authors.data?.results ?? []).length === 0 ? (
            <p className="py-12 text-center text-(--text-muted)">{__('No authors yet.')}</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th text-left">{__('Name')}</th>
                  <th className="table-th text-left">{__('Slug')}</th>
                  <th className="table-th text-right">{__('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {(authors.data?.results ?? []).map((author) => (
                  <tr key={author.id} className="table-tr">
                    <td className="table-td">
                      <button
                        onClick={() => router.push(`/dashboard/authors/${author.id}`)}
                        className="font-medium text-(--text-primary) hover:underline"
                      >
                        {author.name}
                      </button>
                    </td>
                    <td className="table-td text-(--text-muted)">{author.slug}</td>
                    <td className="table-td text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => router.push(`/dashboard/authors/${author.id}`)}
                          className="icon-btn"
                          title={__('Edit')}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={async () => {
                            if (await confirm({ title: __('Delete this author?'), variant: 'danger', confirmLabel: __('Delete') })) {
                              deleteMutation.mutate({ id: author.id });
                            }
                          }}
                          className="icon-btn text-red-500"
                          title={__('Delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
