'use client';

import Link from 'next/link';
import { useAdminTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { adminPanel } from '@/config/routes';

const fmtCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function AffiliateOverview() {
  const __ = useAdminTranslations();
  const { data, isLoading } = trpc.affiliates.getAffiliateStats.useQuery();

  if (isLoading) {
    return <div className="card p-8 text-center text-(--text-muted)">{__('Loading...')}</div>;
  }

  if (!data || data.activeAffiliates === 0) {
    return (
      <div className="card">
        <div className="widget-header">
          <span>{__('Affiliates')}</span>
          <Link href={adminPanel.settingsAffiliates} className="btn btn-sm btn-secondary">
            {__('Manage')}
          </Link>
        </div>
        <div className="empty-state">{__('No affiliates yet.')}</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="widget-header">
        <span>{__('Affiliates')}</span>
        <Link href={adminPanel.settingsAffiliates} className="btn btn-sm btn-secondary">
          {__('Manage')}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 p-4 lg:grid-cols-4">
        <div className="card p-3">
          <div className="text-sm opacity-70">{__('Active Affiliates')}</div>
          <div className="stat-value mt-1 text-2xl">{data.activeAffiliates}</div>
        </div>
        <div className="card p-3">
          <div className="text-sm opacity-70">{__('Total Referrals')}</div>
          <div className="stat-value mt-1 text-2xl">{data.totalReferrals}</div>
        </div>
        <div className="card p-3">
          <div className="text-sm opacity-70">{__('Conversion Rate')}</div>
          <div className="stat-value mt-1 text-2xl">{data.conversionRate.toFixed(2)}%</div>
        </div>
        <div className="card p-3">
          <div className="text-sm opacity-70">{__('Total Earnings')}</div>
          <div className="stat-value mt-1 text-2xl">{fmtCurrency(data.totalEarningsCents)}</div>
        </div>
      </div>

      {data.topAffiliates.length > 0 && (
        <div className="p-4 pt-0">
          <div className="font-semibold text-sm text-(--text-secondary) mb-2 uppercase tracking-wide">
            {__('Top Affiliates')}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="table-thead">
                <tr>
                  <th className="table-th">{__('Affiliate')}</th>
                  <th className="table-th">{__('Code')}</th>
                  <th className="table-th text-right">{__('Referrals')}</th>
                  <th className="table-th text-right">{__('Earnings')}</th>
                  <th className="table-th text-right">{__('Commission')}</th>
                </tr>
              </thead>
              <tbody>
                {data.topAffiliates.map((a) => (
                  <tr key={a.id} className="table-tr">
                    <td className="table-td">{a.userName ?? a.userEmail ?? '—'}</td>
                    <td className="table-td font-mono text-sm">{a.code}</td>
                    <td className="table-td text-right">{a.totalReferrals}</td>
                    <td className="table-td text-right">{fmtCurrency(a.totalEarningsCents)}</td>
                    <td className="table-td text-right">{a.commissionPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
