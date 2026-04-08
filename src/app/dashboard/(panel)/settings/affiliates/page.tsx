'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';

export default function AffiliatesAdminPage() {
  const __ = useAdminTranslations();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = trpc.affiliates.adminList.useQuery({
    page,
    pageSize: 20,
    status: statusFilter ? statusFilter as 'active' | 'suspended' | 'banned' : undefined,
  });

  const utils = trpc.useUtils();
  const updateStatus = trpc.affiliates.updateStatus.useMutation({
    onSuccess: () => utils.affiliates.adminList.invalidate(),
  });

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="h2">{__('Affiliates')}</h1>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
      <div className="flex items-center justify-between mb-4">
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">{__('All Statuses')}</option>
          <option value="active">{__('Active')}</option>
          <option value="suspended">{__('Suspended')}</option>
          <option value="banned">{__('Banned')}</option>
        </select>
      </div>

      {isLoading ? (
        <p>{__('Loading...')}</p>
      ) : !data?.results.length ? (
        <div className="empty-state">{__('No affiliates found')}</div>
      ) : (
        <>
          <div className="card">
            <table className="w-full">
              <thead>
                <tr className="table-thead">
                  <th className="table-th">{__('Code')}</th>
                  <th className="table-th">{__('Commission')}</th>
                  <th className="table-th">{__('Referrals')}</th>
                  <th className="table-th">{__('Earnings')}</th>
                  <th className="table-th">{__('Status')}</th>
                  <th className="table-th">{__('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((aff) => (
                  <tr key={aff.id} className="table-tr">
                    <td className="table-td font-mono">{aff.code}</td>
                    <td className="table-td">{aff.commissionPercent}%</td>
                    <td className="table-td">{aff.totalReferrals}</td>
                    <td className="table-td">${(aff.totalEarningsCents / 100).toFixed(2)}</td>
                    <td className="table-td">
                      <span className={`badge badge-${aff.status === 'active' ? 'published' : 'draft'}`}>
                        {aff.status}
                      </span>
                    </td>
                    <td className="table-td">
                      {aff.status === 'active' ? (
                        <button
                          className="action-btn"
                          onClick={() => updateStatus.mutate({ id: aff.id, status: 'suspended' })}
                          disabled={updateStatus.isPending}
                        >
                          {__('Suspend')}
                        </button>
                      ) : aff.status === 'suspended' ? (
                        <button
                          className="action-btn"
                          onClick={() => updateStatus.mutate({ id: aff.id, status: 'active' })}
                          disabled={updateStatus.isPending}
                        >
                          {__('Activate')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.totalPages > 1 && (
            <div className="pagination mt-4">
              <button
                className="btn btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {__('Previous')}
              </button>
              <span className="text-sm text-(--text-secondary)">
                {__('Page')} {page} / {data.totalPages}
              </span>
              <button
                className="btn btn-sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {__('Next')}
              </button>
            </div>
          )}
        </>
      )}
    </div></main>
    </>
  );
}
