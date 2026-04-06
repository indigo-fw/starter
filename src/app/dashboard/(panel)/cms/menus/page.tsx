'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { adminPanel } from '@/config/routes';
import { slugify } from '@/core/lib/slug';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function MenusPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const menusQuery = trpc.menus.list.useQuery();

  const createMenu = trpc.menus.create.useMutation({
    onSuccess: () => {
      toast.success(__('Menu created'));
      setShowCreate(false);
      setNewName('');
      utils.menus.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMenu = trpc.menus.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Menu deleted'));
      utils.menus.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMenu.mutate({ name: newName.trim(), slug: slugify(newName) });
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Menus')}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4" />
              {__('New Menu')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner menus-page">
      {showCreate && (
        <form onSubmit={handleCreate} className="menus-create-form mt-4 card flex items-center gap-3 p-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={__('Menu name')}
            className="flex-1 rounded-md border border-(--border-primary) px-3 py-2 text-sm"
            autoFocus
          />
          <button
            type="submit"
            disabled={createMenu.isPending}
            className="btn btn-primary disabled:opacity-50"
          >
            {createMenu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {__('Create')}
          </button>
          <button
            type="button"
            onClick={() => { setShowCreate(false); setNewName(''); }}
            className="btn btn-secondary"
          >
            {__('Cancel')}
          </button>
        </form>
      )}

      <div className="mt-4 card overflow-hidden">
        {menusQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (menusQuery.data ?? []).length === 0 ? (
          <p className="py-12 text-center text-sm text-(--text-muted)">
            {__('No menus yet. Create your first one.')}
          </p>
        ) : (
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{__('Name')}</th>
                <th className="th w-40">{__('Slug')}</th>
                <th className="th w-28" />
              </tr>
            </thead>
            <tbody>
              {(menusQuery.data ?? []).map((menu) => (
                <tr key={menu.id} className="hover:bg-(--surface-secondary)">
                  <td className="td font-medium text-(--text-primary)">{menu.name}</td>
                  <td className="td text-sm font-mono text-(--text-muted)">{menu.slug}</td>
                  <td className="td">
                    <div className="menus-row-actions flex items-center justify-end gap-1">
                      <Link
                        href={adminPanel.menuDetail(menu.id)}
                        className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-brand-600"
                        title={__('Edit')}
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => setDeleteTarget({ id: menu.id, name: menu.name })}
                        className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
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

      <ConfirmDialog
        open={!!deleteTarget}
        title={__('Delete menu?')}
        message={__('"{name}" and all its items will be permanently deleted.', { name: deleteTarget?.name ?? '' })}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteMenu.mutate({ id: deleteTarget.id });
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div></main>
    </>
  );
}
