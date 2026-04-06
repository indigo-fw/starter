'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { adminPanel } from '@/config/routes';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DiscountType } from '@/core-payments/types/payment';

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  [DiscountType.PERCENTAGE]: 'Percentage',
  [DiscountType.FIXED_PRICE]: 'Fixed Price',
  [DiscountType.TRIAL]: 'Trial',
  [DiscountType.FREE_TRIAL]: 'Free Trial',
};

export default function DiscountCodesPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>(DiscountType.PERCENTAGE);
  const [discountValue, setDiscountValue] = useState<number | null>(null);
  const [trialDays, setTrialDays] = useState<number | null>(null);
  const [trialPriceCents, setTrialPriceCents] = useState<number | null>(null);
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [maxUsesPerUser, setMaxUsesPerUser] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string } | null>(null);

  const codesQuery = trpc.discountCodes.list.useQuery();

  const createCode = trpc.discountCodes.create.useMutation({
    onSuccess: () => {
      toast.success(__('Discount code created'));
      resetForm();
      utils.discountCodes.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateCode = trpc.discountCodes.update.useMutation({
    onSuccess: () => {
      toast.success(__('Discount code updated'));
      resetForm();
      utils.discountCodes.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCode = trpc.discountCodes.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Discount code deleted'));
      utils.discountCodes.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setCode('');
    setDiscountType(DiscountType.PERCENTAGE);
    setDiscountValue(null);
    setTrialDays(null);
    setTrialPriceCents(null);
    setMaxUses(null);
    setMaxUsesPerUser(1);
    setIsActive(true);
  }

  function startEdit(item: {
    id: string;
    code: string;
    discountType: string;
    discountValue: number | null;
    trialDays: number | null;
    trialPriceCents: number | null;
    maxUses: number | null;
    maxUsesPerUser: number;
    isActive: boolean;
  }) {
    setEditId(item.id);
    setCode(item.code);
    setDiscountType(item.discountType as DiscountType);
    setDiscountValue(item.discountValue);
    setTrialDays(item.trialDays);
    setTrialPriceCents(item.trialPriceCents);
    setMaxUses(item.maxUses);
    setMaxUsesPerUser(item.maxUsesPerUser);
    setIsActive(item.isActive);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      code,
      discountType,
      discountValue,
      trialDays,
      trialPriceCents,
      maxUses,
      maxUsesPerUser,
      isActive,
    };
    if (editId) {
      updateCode.mutate({ id: editId, ...data });
    } else {
      createCode.mutate(data);
    }
  }

  const isPending = createCode.isPending || updateCode.isPending;

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <Link
              href={adminPanel.settings}
              className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary)"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold text-(--text-primary)">{__('Discount Codes')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { resetForm(); setShowForm(true); }} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              {__('New Code')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 card p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">{__('Code')}</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="input mt-1"
                placeholder="SAVE20"
              />
            </div>
            <div>
              <label className="label">{__('Type')}</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                className="select mt-1"
              >
                {Object.entries(DISCOUNT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{__(label)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(discountType === DiscountType.PERCENTAGE || discountType === DiscountType.FIXED_PRICE) && (
              <div>
                <label className="label">
                  {discountType === DiscountType.PERCENTAGE ? __('Percentage (0-100)') : __('Price (cents)')}
                </label>
                <input
                  type="number"
                  value={discountValue ?? ''}
                  onChange={(e) => setDiscountValue(e.target.value ? Number(e.target.value) : null)}
                  className="input mt-1"
                  min={0}
                  max={discountType === DiscountType.PERCENTAGE ? 100 : undefined}
                />
              </div>
            )}
            {(discountType === DiscountType.TRIAL || discountType === DiscountType.FREE_TRIAL) && (
              <>
                <div>
                  <label className="label">{__('Trial Days')}</label>
                  <input
                    type="number"
                    value={trialDays ?? ''}
                    onChange={(e) => setTrialDays(e.target.value ? Number(e.target.value) : null)}
                    className="input mt-1"
                    min={1}
                    max={365}
                  />
                </div>
                {discountType === DiscountType.TRIAL && (
                  <div>
                    <label className="label">{__('Trial Price (cents)')}</label>
                    <input
                      type="number"
                      value={trialPriceCents ?? ''}
                      onChange={(e) => setTrialPriceCents(e.target.value ? Number(e.target.value) : null)}
                      className="input mt-1"
                      min={0}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">{__('Max Uses (leave empty for unlimited)')}</label>
              <input
                type="number"
                value={maxUses ?? ''}
                onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : null)}
                className="input mt-1"
                min={1}
              />
            </div>
            <div>
              <label className="label">{__('Max Uses Per User')}</label>
              <input
                type="number"
                value={maxUsesPerUser}
                onChange={(e) => setMaxUsesPerUser(Number(e.target.value) || 1)}
                className="input mt-1"
                min={1}
                max={100}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-(--border-primary)"
            />
            {__('Active')}
          </label>

          <div className="flex gap-2">
            <button type="submit" disabled={isPending || !code} className="btn btn-primary disabled:opacity-50">
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
        {codesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (codesQuery.data ?? []).length === 0 ? (
          <p className="py-12 text-center text-sm text-(--text-muted)">
            {__('No discount codes configured.')}
          </p>
        ) : (
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{__('Code')}</th>
                <th className="th">{__('Type')}</th>
                <th className="th">{__('Value')}</th>
                <th className="th">{__('Uses')}</th>
                <th className="th w-20">{__('Status')}</th>
                <th className="th w-24" />
              </tr>
            </thead>
            <tbody>
              {(codesQuery.data ?? []).map((item) => (
                <tr key={item.id} className="tr">
                  <td className="td font-mono font-medium text-(--text-primary)">{item.code}</td>
                  <td className="td text-sm text-(--text-secondary)">
                    {__(DISCOUNT_TYPE_LABELS[item.discountType] ?? item.discountType)}
                  </td>
                  <td className="td text-sm text-(--text-secondary)">
                    {item.discountType === DiscountType.PERCENTAGE && item.discountValue !== null
                      ? `${item.discountValue}%`
                      : item.discountType === DiscountType.FIXED_PRICE && item.discountValue !== null
                        ? `$${(item.discountValue / 100).toFixed(2)}`
                        : item.trialDays
                          ? `${item.trialDays} days`
                          : '—'}
                  </td>
                  <td className="td text-sm text-(--text-secondary)">
                    {item.currentUses}{item.maxUses !== null ? ` / ${item.maxUses}` : ''}
                  </td>
                  <td className="td">
                    <span className={`badge ${item.isActive ? 'badge-published' : 'badge-draft'}`}>
                      {item.isActive ? __('Active') : __('Inactive')}
                    </span>
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(item)}
                        className="action-btn"
                        title={__('Edit')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: item.id, code: item.code })}
                        className="action-btn hover:text-red-600"
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
        title={__('Delete discount code?')}
        message={__('Code "{code}" will be permanently deleted.', { code: deleteTarget?.code ?? '' })}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) deleteCode.mutate({ id: deleteTarget.id });
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div></main>
    </>
  );
}
