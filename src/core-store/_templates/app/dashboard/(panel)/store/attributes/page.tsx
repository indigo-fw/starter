'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  SlidersHorizontal,
  Trash2,
  Check,
  X,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { cn } from '@/lib/utils';

type AttributeType = 'select' | 'text' | 'number';

const TYPE_BADGE: Record<AttributeType, string> = {
  select: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
  text: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  number: 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-400',
};

export default function StoreAttributesPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<AttributeType>('select');
  const [formValues, setFormValues] = useState('');
  const [formFilterable, setFormFilterable] = useState(true);

  const attributes = trpc.storeAttributes.adminListAttributes.useQuery();

  const create = trpc.storeAttributes.createAttribute.useMutation({
    onSuccess: () => {
      resetForm();
      utils.storeAttributes.adminListAttributes.invalidate();
    },
  });

  const deleteMutation = trpc.storeAttributes.deleteAttribute.useMutation({
    onSuccess: () => {
      utils.storeAttributes.adminListAttributes.invalidate();
    },
  });

  function resetForm() {
    setShowForm(false);
    setFormName('');
    setFormType('select');
    setFormValues('');
    setFormFilterable(true);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;

    create.mutate({
      name: formName.trim(),
      type: formType,
      values: formType === 'select'
        ? formValues
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : undefined,
      filterable: formFilterable,
    });
  }

  const data = attributes.data;

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
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('Attributes')}</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary text-sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            {__('Add Attribute')}
          </button>
        </div>
      </header>
      <main className="dash-main">
        <div className="dash-inner">
          {/* Add form */}
          {showForm && (
            <form onSubmit={handleCreate} className="card mt-4 p-4">
              <h3 className="text-sm font-semibold text-(--text-primary) mb-3">
                {__('New Attribute')}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="text-xs font-medium text-(--text-secondary) mb-1 block">
                    {__('Name')}
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={__('e.g. Color, Size')}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-(--text-secondary) mb-1 block">
                    {__('Type')}
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as AttributeType)}
                    className="input w-full"
                  >
                    <option value="select">{__('Select')}</option>
                    <option value="text">{__('Text')}</option>
                    <option value="number">{__('Number')}</option>
                  </select>
                </div>
                {formType === 'select' && (
                  <div>
                    <label className="text-xs font-medium text-(--text-secondary) mb-1 block">
                      {__('Values')} <span className="text-(--text-muted)">({__('comma-separated')})</span>
                    </label>
                    <input
                      type="text"
                      value={formValues}
                      onChange={(e) => setFormValues(e.target.value)}
                      placeholder="Red, Blue, Green"
                      className="input w-full"
                    />
                  </div>
                )}
                <div className="flex items-end">
                  <label className="flex items-center gap-2 pb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formFilterable}
                      onChange={(e) => setFormFilterable(e.target.checked)}
                      className="rounded border-(--border-primary)"
                    />
                    <span className="text-sm text-(--text-secondary)">{__('Filterable')}</span>
                  </label>
                </div>
              </div>
              {create.error && (
                <p className="text-sm text-red-600 mt-3">{create.error.message}</p>
              )}
              <div className="flex gap-2 mt-4">
                <button type="submit" disabled={create.isPending} className="btn btn-primary text-sm">
                  {create.isPending ? __('Saving...') : __('Save')}
                </button>
                <button type="button" onClick={resetForm} className="btn btn-secondary text-sm">
                  {__('Cancel')}
                </button>
              </div>
            </form>
          )}

          {/* Table */}
          <div className="card mt-4 overflow-hidden">
            {attributes.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
              </div>
            ) : !data?.length ? (
              <div className="empty-state py-16 text-center">
                <SlidersHorizontal className="empty-state-icon mx-auto h-12 w-12 text-(--text-muted)" />
                <h3 className="empty-state-title mt-3 text-lg font-semibold text-(--text-primary)">
                  {__('No attributes defined')}
                </h3>
                <p className="empty-state-text mt-1 text-sm text-(--text-muted)">
                  {__('Add your first attribute to enable product filtering.')}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="table-thead">
                  <tr>
                    <th className="table-th">{__('Name')}</th>
                    <th className="table-th w-28">{__('Slug')}</th>
                    <th className="table-th w-24">{__('Type')}</th>
                    <th className="table-th">{__('Values')}</th>
                    <th className="table-th w-24">{__('Filterable')}</th>
                    <th className="table-th w-20">{__('Usage')}</th>
                    <th className="table-th w-16" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((attr) => (
                    <tr key={attr.id} className="table-tr hover:bg-(--surface-secondary)">
                      <td className="table-td table-td-primary">
                        <span className="font-medium text-(--text-primary)">{attr.name}</span>
                      </td>
                      <td className="table-td">
                        <span className="font-mono text-xs text-(--text-muted)">{attr.slug}</span>
                      </td>
                      <td className="table-td">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                            TYPE_BADGE[attr.type as AttributeType] ?? 'bg-(--surface-secondary) text-(--text-muted)',
                          )}
                        >
                          {__(attr.type)}
                        </span>
                      </td>
                      <td className="table-td text-sm text-(--text-muted) truncate max-w-48">
                        {attr.values?.length
                          ? attr.values.join(', ')
                          : '\u2014'}
                      </td>
                      <td className="table-td">
                        {attr.filterable ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <X className="h-4 w-4 text-(--text-muted)" />
                        )}
                      </td>
                      <td className="table-td text-sm text-(--text-muted)">
                        {attr.usageCount ?? 0}
                      </td>
                      <td className="table-td table-td-actions">
                        <button
                          onClick={() => deleteMutation.mutate({ id: attr.id })}
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
        </div>
      </main>
    </>
  );
}
