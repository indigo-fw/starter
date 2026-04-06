'use client';

import { useAdminTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface SubscriptionSummaryProps {
  data: {
    totalActive: number;
    mrr: number;
    trialing: number;
    planDistribution: { planId: string; count: number }[];
    churn: {
      canceled30d: number;
      pastDue: number;
      unpaid: number;
      totalEver: number;
      churnRate: number;
    };
    totalRevenue: number;
  } | undefined;
  isLoading: boolean;
}

const fmtCurrency = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-current/10', className)} />;
}

export function SubscriptionSummary({ data, isLoading }: SubscriptionSummaryProps) {
  const __ = useAdminTranslations();

  return (
    <div className="flex flex-col gap-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <div className="text-sm opacity-70">{__('Active Subscriptions')}</div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className="stat-value text-2xl">{data?.totalActive ?? 0}</span>
              <span className="badge badge-published">{__('Active')}</span>
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="text-sm opacity-70">{__('MRR')}</div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <div className="stat-value mt-1 text-2xl">{fmtCurrency(data?.mrr ?? 0)}</div>
          )}
        </div>

        <div className="card p-4">
          <div className="text-sm opacity-70">{__('Total Revenue')}</div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <div className="stat-value mt-1 text-2xl">{fmtCurrency(data?.totalRevenue ?? 0)}</div>
          )}
        </div>

        <div className="card p-4">
          <div className="text-sm opacity-70">{__('Trialing')}</div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className="stat-value text-2xl">{data?.trialing ?? 0}</span>
              <span className="badge badge-draft">{__('Trial')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Plan Distribution */}
      <div className="card p-4">
        <div className="font-semibold text-sm text-(--text-secondary) mb-3 uppercase tracking-wide">{__('Plan Distribution')}</div>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ) : (
          <div className="stat-grid">
            {(data?.planDistribution ?? []).map((plan) => (
              <div key={plan.planId} className="stat-row">
                <span className="stat-label">{capitalize(plan.planId)}</span>
                <span className="stat-value">{plan.count}</span>
              </div>
            ))}
            {(!data?.planDistribution || data.planDistribution.length === 0) && (
              <div className="opacity-50">{__('No subscriptions yet')}</div>
            )}
          </div>
        )}
      </div>

      {/* Churn Metrics */}
      <div className="card p-4">
        <div className="font-semibold text-sm text-(--text-secondary) mb-3 uppercase tracking-wide">{__('Churn Metrics')}</div>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          <div className="stat-grid">
            <div className="stat-row">
              <span className="stat-label">{__('Churn Rate (30d)')}</span>
              <span className="stat-value">{(data?.churn.churnRate ?? 0).toFixed(2)}%</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">{__('Canceled (30d)')}</span>
              <span className="stat-value">{data?.churn.canceled30d ?? 0}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">{__('Past Due (at risk)')}</span>
              <span className="stat-value">{data?.churn.pastDue ?? 0}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">{__('Unpaid (lost)')}</span>
              <span className="stat-value">{data?.churn.unpaid ?? 0}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">{__('Total Ever Subscribed')}</span>
              <span className="stat-value">{data?.churn.totalEver ?? 0}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
