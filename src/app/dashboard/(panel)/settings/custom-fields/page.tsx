'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { adminPanel } from '@/config/routes';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'boolean',
  'select',
  'date',
  'url',
  'color',
] as const;

const CONTENT_TYPES = ['page', 'blog', 'category'] as const;

type FieldType = (typeof FIELD_TYPES)[number];

interface FormState {
  name: string;
  fieldType: FieldType;
  contentTypes: string[];
  sortOrder: number;
  choices: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  fieldType: 'text',
  contentTypes: [],
  sortOrder: 0,
  choices: '',
};

export default function CustomFieldsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const fieldsQuery = trpc.customFields.list.useQuery();

  const createField = trpc.customFields.create.useMutation({
    onSuccess: () => {
      toast.success(__('Custom field created'));
      resetForm();
      utils.customFields.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateField = trpc.customFields.update.useMutation({
    onSuccess: () => {
      toast.success(__('Custom field updated'));
      resetForm();
      utils.customFields.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteField = trpc.customFields.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Custom field deleted'));
      utils.customFields.list.invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteTarget(null);
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(def: {
    id: string;
    name: string;
    fieldType: string;
    contentTypes: unknown;
    sortOrder: number;
    options: unknown;
  }) {
    const opts = def.options as Record<string, unknown> | null;
    const choices = opts?.choices as string[] | undefined;
    setEditId(def.id);
    setForm({
      name: def.name,
      fieldType: def.fieldType as FieldType,
      contentTypes: def.contentTypes as string[],
      sortOrder: def.sortOrder,
      choices: choices?.join('\n') ?? '',
    });
    setShowForm(true);
  }

  function toggleContentType(ct: string) {
    setForm((prev) => ({
      ...prev,
      contentTypes: prev.contentTypes.includes(ct)
        ? prev.contentTypes.filter((t) => t !== ct)
        : [...prev.contentTypes, ct],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const options: Record<string, unknown> = {};
    if (form.fieldType === 'select' && form.choices.trim()) {
      options.choices = form.choices
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean);
    }

    if (editId) {
      updateField.mutate({
        id: editId,
        name: form.name,
        fieldType: form.fieldType,
        contentTypes: form.contentTypes,
        sortOrder: form.sortOrder,
        options: Object.keys(options).length > 0 ? options : null,
      });
    } else {
      createField.mutate({
        name: form.name,
        fieldType: form.fieldType,
        contentTypes: form.contentTypes,
        sortOrder: form.sortOrder,
        options: Object.keys(options).length > 0 ? options : undefined,
      });
    }
  }

  const isPending = createField.isPending || updateField.isPending;

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="custom-fields-page-header-left flex items-center gap-3">
            <Link
              href={adminPanel.settings}
              className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary)"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-(--text-primary)">
              {__('Custom Fields')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4" />
              {__('New Field')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner custom-fields-page">
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="custom-field-form mt-4 card p-6 space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Name')}
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm"
                placeholder={__('e.g. Author Bio')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Field Type')}
              </label>
              <select
                value={form.fieldType}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    fieldType: e.target.value as FieldType,
                  }))
                }
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm"
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {ft.charAt(0).toUpperCase() + ft.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-(--text-secondary) mb-2">
                {__('Content Types')}
              </label>
              <div className="flex flex-wrap gap-3">
                {CONTENT_TYPES.map((ct) => (
                  <label
                    key={ct}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.contentTypes.includes(ct)}
                      onChange={() => toggleContentType(ct)}
                      className="rounded border-(--border-primary)"
                    />
                    {ct.charAt(0).toUpperCase() + ct.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Sort Order')}
              </label>
              <input
                type="number"
                min={0}
                max={9999}
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    sortOrder: Number(e.target.value),
                  }))
                }
                className="mt-1 block w-32 rounded-md border border-(--border-primary) px-3 py-2 text-sm"
              />
            </div>
          </div>

          {form.fieldType === 'select' && (
            <div>
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Choices (one per line)')}
              </label>
              <textarea
                value={form.choices}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, choices: e.target.value }))
                }
                rows={4}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm font-mono"
                placeholder={__('Option A\nOption B\nOption C')}
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || form.contentTypes.length === 0 || !form.name}
              className="btn btn-primary disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {editId ? __('Update') : __('Create')}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="btn btn-secondary"
            >
              {__('Cancel')}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 card overflow-hidden">
        {fieldsQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (fieldsQuery.data ?? []).length === 0 ? (
          <p className="py-12 text-center text-sm text-(--text-muted)">
            {__('No custom fields defined yet.')}
          </p>
        ) : (
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{__('Name')}</th>
                <th className="th">{__('Slug')}</th>
                <th className="th">{__('Type')}</th>
                <th className="th">{__('Content Types')}</th>
                <th className="th w-24">{__('Sort Order')}</th>
                <th className="th w-24" />
              </tr>
            </thead>
            <tbody>
              {(fieldsQuery.data ?? []).map((def) => (
                <tr key={def.id} className="hover:bg-(--surface-secondary)">
                  <td className="td font-medium text-(--text-primary)">
                    {def.name}
                  </td>
                  <td className="td text-xs font-mono text-(--text-muted)">
                    {def.slug}
                  </td>
                  <td className="td text-sm text-(--text-secondary)">
                    {def.fieldType}
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {(def.contentTypes as string[]).map((ct) => (
                        <span
                          key={ct}
                          className="inline-flex items-center rounded-full bg-(--color-brand-50) dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.12)] px-2 py-0.5 text-xs font-medium text-(--color-brand-700) dark:text-(--color-brand-400)"
                        >
                          {ct}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="td text-sm text-(--text-secondary)">
                    {def.sortOrder}
                  </td>
                  <td className="td">
                    <div className="custom-fields-page-row-actions flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(def)}
                        className="rounded p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--color-brand-600)"
                        title={__('Edit')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          setDeleteTarget({ id: def.id, name: def.name })
                        }
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
        title={__('Delete custom field?')}
        message={__(
          `"${deleteTarget?.name}" and all its saved values will be permanently deleted.`
        )}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteField.mutate({ id: deleteTarget.id });
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div></main>
    </>
  );
}
