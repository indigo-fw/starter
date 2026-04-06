'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface RevenueChartProps {
  from?: string;
  to?: string;
}

const BRAND = '#e54580';
const ACCENT = '#a855f7';
const GRID = 'rgba(100, 100, 100, 0.15)';

interface TooltipPayloadEntry {
  dataKey: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  const __ = useAdminTranslations();
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
      <p style={{ marginBottom: 4, fontWeight: 600 }}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color, margin: 0 }}>
          {entry.dataKey === 'revenue'
            ? `${__('Revenue')}: $${Number(entry.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `${__('Transactions')}: ${entry.value}`}
        </p>
      ))}
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDollar(value: number) {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function RevenueChart({ from, to }: RevenueChartProps) {
  const __ = useAdminTranslations();
  const { data, isLoading } = trpc.billing.revenueOverTime.useQuery({ from, to });

  if (isLoading) {
    return (
      <div className="card">
        <div className="widget-header"><h3>{__('Revenue Over Time')}</h3></div>
        <div className={cn('animate-pulse')} style={{ height: 400, background: 'rgba(128, 128, 128, 0.08)', borderRadius: 8 }} />
      </div>
    );
  }

  const chartData = data?.map((d) => ({
    date: formatDate(d.date),
    revenue: d.revenue / 100,
    count: d.count,
  })) ?? [];

  return (
    <div className="card">
      <div className="widget-header"><h3>{__('Revenue Over Time')}</h3></div>
      {chartData.length === 0 ? (
        <div className="empty-state" style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>{__('No revenue data for this period.')}</p>
        </div>
      ) : (
        <div style={{ height: 400, padding: '16px 0' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tickFormatter={formatDollar} tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                name={__('Revenue')}
                stroke={BRAND}
                fill={BRAND}
                fillOpacity={0.12}
                strokeWidth={2}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="count"
                name={__('Transactions')}
                stroke={ACCENT}
                fill={ACCENT}
                fillOpacity={0.08}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
