'use client';

import { useAdminTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
};

const STATUS_BADGE: Record<string, string> = {
  successful: 'badge badge-published',
  pending: 'badge badge-scheduled',
  failed: 'badge badge-draft',
  refunded: 'badge badge-draft',
};

interface RecentTransactionsTableProps {
  transactions: {
    id: string;
    organizationId: string;
    orgName: string | null;
    providerId: string;
    amountCents: number;
    currency: string;
    status: string;
    planId: string | null;
    interval: string | null;
    createdAt: Date;
  }[] | undefined;
  isLoading: boolean;
}

export function RecentTransactionsTable({ transactions, isLoading }: RecentTransactionsTableProps) {
  const __ = useAdminTranslations();

  const formatAmount = (cents: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

  return (
    <div className="card">
      <div className="widget-header">
        <h3>{__('Recent Transactions')}</h3>
      </div>
      {isLoading ? (
        <p className="p-6 text-center">{__('Loading...')}</p>
      ) : !transactions?.length ? (
        <div className="empty-state">{__('No transactions yet.')}</div>
      ) : (
        <table className="w-full">
          <thead className="table-thead">
            <tr>
              <th className="table-th">{__('Organization')}</th>
              <th className="table-th">{__('Amount')}</th>
              <th className="table-th">{__('Plan')}</th>
              <th className="table-th">{__('Status')}</th>
              <th className="table-th">{__('Provider')}</th>
              <th className="table-th">{__('Date')}</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="table-tr">
                <td className="table-td">{tx.orgName ?? tx.organizationId}</td>
                <td className="table-td">{formatAmount(tx.amountCents, tx.currency)}</td>
                <td className="table-td">{tx.planId ? __(PLAN_LABELS[tx.planId] ?? tx.planId) : '—'}</td>
                <td className="table-td">
                  <span className={cn(STATUS_BADGE[tx.status] ?? 'badge')}>
                    {__(tx.status)}
                  </span>
                </td>
                <td className="table-td">{tx.providerId}</td>
                <td className="table-td">{new Date(tx.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
