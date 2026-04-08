'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, Zap } from 'lucide-react';
import Link from 'next/link';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { adminPanel } from '@/config/routes';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const ALL_EVENTS = [
  'post.created',
  'post.updated',
  'post.published',
  'post.deleted',
  'category.created',
  'category.updated',
  'category.deleted',
];

export default function WebhooksPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const webhooksQuery = trpc.webhooks.list.useQuery();

  const createWebhook = trpc.webhooks.create.useMutation({
    onSuccess: () => {
      toast.success(__('Webhook created'));
      resetForm();
      utils.webhooks.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateWebhook = trpc.webhooks.update.useMutation({
    onSuccess: () => {
      toast.success(__('Webhook updated'));
      resetForm();
      utils.webhooks.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteWebhook = trpc.webhooks.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Webhook deleted'));
      utils.webhooks.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const testWebhook = trpc.webhooks.test.useMutation({
    onSuccess: (data) => toast.success(__('Test sent (status {status})', { status: data.status })),
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setName('');
    setUrl('');
    setEvents([]);
    setActive(true);
  }

  function startEdit(hook: { id: string; name: string; url: string; events: unknown; active: boolean }) {
    setEditId(hook.id);
    setName(hook.name);
    setUrl(hook.url);
    setEvents(hook.events as string[]);
    setActive(hook.active);
    setShowForm(true);
  }

  function toggleEvent(event: string) {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editId) {
      updateWebhook.mutate({ id: editId, name, url, events, active });
    } else {
      createWebhook.mutate({ name, url, events, active });
    }
  }

  const isPending = createWebhook.isPending || updateWebhook.isPending;

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="webhooks-header-left flex items-center gap-3">
            <Link
              href={adminPanel.settings}
              className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary)"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('Webhooks')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { resetForm(); setShowForm(true); }} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              {__('New Webhook')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner webhooks-page">
      {showForm && (
        <form onSubmit={handleSubmit} className="webhook-form mt-4 card p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">{__('Name')}</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">{__('URL')}</label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm"
                placeholder="https://example.com/webhook"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-(--text-secondary) mb-2">{__('Events')}</label>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={events.includes(event)}
                    onChange={() => toggleEvent(event)}
                    className="rounded border-(--border-primary)"
                  />
                  {event}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-(--border-primary)"
            />
            {__('Active')}
          </label>

          <div className="flex gap-2">
            <button type="submit" disabled={isPending || events.length === 0} className="btn btn-primary disabled:opacity-50">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editId ? __('Update') : __('Create')}
            </button>
            <button type="button" onClick={resetForm} className="btn btn-secondary">
              {__('Cancel')}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 card overflow-hidden">
        {webhooksQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (webhooksQuery.data ?? []).length === 0 ? (
          <p className="py-12 text-center text-sm text-(--text-muted)">
            {__('No webhooks configured.')}
          </p>
        ) : (
          <table className="w-full">
            <thead className="table-thead">
              <tr>
                <th className="table-th">{__('Name')}</th>
                <th className="table-th">{__('URL')}</th>
                <th className="table-th w-20">{__('Status')}</th>
                <th className="table-th w-32" />
              </tr>
            </thead>
            <tbody>
              {(webhooksQuery.data ?? []).map((hook) => (
                <tr key={hook.id} className="hover:bg-(--surface-secondary)">
                  <td className="table-td font-medium text-(--text-primary)">{hook.name}</td>
                  <td className="table-td text-xs font-mono text-(--text-muted) truncate max-w-xs">{hook.url}</td>
                  <td className="table-td">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${hook.active ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-(--surface-secondary) text-(--text-muted)'}`}>
                      {hook.active ? __('Active') : __('Inactive')}
                    </span>
                  </td>
                  <td className="table-td">
                    <div className="webhooks-row-actions flex items-center justify-end gap-1">
                      <button
                        onClick={() => testWebhook.mutate({ id: hook.id })}
                        className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--color-brand-600)"
                        title={__('Test')}
                      >
                        <Zap className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => startEdit(hook)}
                        className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--color-brand-600)"
                        title={__('Edit')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: hook.id, name: hook.name })}
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
        title={__('Delete webhook?')}
        message={__('"{name}" will be permanently deleted.', { name: deleteTarget?.name ?? '' })}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteWebhook.mutate({ id: deleteTarget.id });
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div></main>
    </>
  );
}
