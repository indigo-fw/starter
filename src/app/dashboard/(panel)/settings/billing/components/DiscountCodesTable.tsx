'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { adminPanel } from '@/config/routes';
import { useAdminTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  percentage: 'Percentage',
  fixed_price: 'Fixed Price',
  trial: 'Trial',
  free_trial: 'Free Trial',
};

function formatValue(type: string, value: number | null, trialDays: number | null) {
  switch (type) {
    case 'percentage':
      return `${value}%`;
    case 'fixed_price':
      return `$${((value ?? 0) / 100).toFixed(2)}`;
    case 'trial':
      return `${trialDays} days`;
    case 'free_trial':
      return `${trialDays} days free`;
    default:
      return String(value ?? '—');
  }
}

export function DiscountCodesTable() {
  const __ = useAdminTranslations();
  const { data: codes, isLoading } = trpc.billing.listDiscountCodes.useQuery();

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="widget-header">
        <h3>{__('Discount Codes')}</h3>
        <Link href={adminPanel.settingsDiscountCodes} className="btn btn-sm btn-secondary">
          {__('Manage')}
        </Link>
      </div>

      {!codes?.length ? (
        <div className="empty-state">{__('No discount codes yet.')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{__('Code')}</th>
                <th className="th">{__('Type')}</th>
                <th className="th">{__('Value')}</th>
                <th className="th">{__('Usage')}</th>
                <th className="th">{__('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id} className="tr">
                  <td className="td font-mono font-semibold">{code.code}</td>
                  <td className="td">{__(TYPE_LABELS[code.discountType] ?? code.discountType)}</td>
                  <td className="td">
                    {formatValue(code.discountType, code.discountValue, code.trialDays)}
                  </td>
                  <td className="td">
                    <UsageBar currentUses={code.currentUses} maxUses={code.maxUses} />
                  </td>
                  <td className="td">
                    <span className={cn('badge', code.isActive ? 'badge-published' : 'badge-draft')}>
                      {code.isActive ? __('Active') : __('Inactive')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UsageBar({ currentUses, maxUses }: { currentUses: number; maxUses: number | null }) {
  const __ = useAdminTranslations();

  if (maxUses == null) {
    return (
      <span className="text-sm">
        {currentUses} <span className="text-[var(--text-tertiary)]">/ {__('unlimited')}</span>
      </span>
    );
  }

  const pct = maxUses > 0 ? Math.min((currentUses / maxUses) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full bg-[var(--surface-inset)]">
        <div
          className="h-full rounded-full bg-[var(--brand)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm tabular-nums">
        {currentUses} / {maxUses}
      </span>
    </div>
  );
}
