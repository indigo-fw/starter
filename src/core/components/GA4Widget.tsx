'use client';

import { useState, type ReactNode } from 'react';
import { BarChart3, Eye, Users, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/translations';
import { cn } from '@/lib/utils';

/* ── Simple SVG line chart (no external chart library) ───────────────────── */

function SimpleLineChart({
  data,
}: {
  data: Array<{ date: string; views: number }>;
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data.map((d) => d.views), 1);
  const w = 600;
  const h = 200;
  const padX = 40;
  const padTop = 16;
  const padBottom = 32;
  const chartW = w - padX * 2;
  const chartH = h - padTop - padBottom;

  const points = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * chartW,
    y: padTop + chartH - (d.views / max) * chartH,
  }));

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Gradient fill area
  const areaPath = [
    `M ${points[0].x},${padTop + chartH}`,
    `L ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`,
    `L ${points[points.length - 1].x},${padTop + chartH}`,
    'Z',
  ].join(' ');

  // Y-axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const value = Math.round((max / 4) * i);
    const y = padTop + chartH - (value / max) * chartH;
    return { value, y };
  });

  // X-axis labels (show ~5 evenly spaced dates)
  const xLabelCount = Math.min(5, data.length);
  const xLabels = Array.from({ length: xLabelCount }, (_, i) => {
    const idx = Math.round((i / (xLabelCount - 1)) * (data.length - 1));
    const raw = data[idx]?.date ?? '';
    // Format YYYYMMDD -> MM/DD
    const label =
      raw.length === 8
        ? `${raw.slice(4, 6)}/${raw.slice(6, 8)}`
        : raw;
    return { label, x: points[idx]?.x ?? 0 };
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48" aria-label="Page views chart">
      <defs>
        <linearGradient id="ga4-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.7 0.15 250)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="oklch(0.7 0.15 250)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map((tick) => (
        <line
          key={tick.value}
          x1={padX}
          y1={tick.y}
          x2={w - padX}
          y2={tick.y}
          stroke="currentColor"
          strokeOpacity="0.08"
          strokeDasharray="4 4"
        />
      ))}

      {/* Y-axis labels */}
      {yTicks.map((tick) => (
        <text
          key={tick.value}
          x={padX - 8}
          y={tick.y + 4}
          textAnchor="end"
          className="fill-current text-(--text-muted)"
          fontSize="10"
        >
          {tick.value.toLocaleString()}
        </text>
      ))}

      {/* X-axis labels */}
      {xLabels.map((lbl, i) => (
        <text
          key={i}
          x={lbl.x}
          y={h - 6}
          textAnchor="middle"
          className="fill-current text-(--text-muted)"
          fontSize="10"
        >
          {lbl.label}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaPath} fill="url(#ga4-area-grad)" />

      {/* Line */}
      <polyline
        fill="none"
        stroke="oklch(0.7 0.15 250)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={polylinePoints}
      />

      {/* Dots on first, last, and max points */}
      {points.map((p, i) => {
        const isEndpoint = i === 0 || i === points.length - 1;
        const isMax = data[i]?.views === max;
        if (!isEndpoint && !isMax) return null;
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill="oklch(0.7 0.15 250)"
            stroke="var(--color-white, #fff)"
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}

/* ── Period selector ─────────────────────────────────────────────────────── */

const PERIODS = [
  { label: '7d', value: '7' as const },
  { label: '30d', value: '30' as const },
  { label: '90d', value: '90' as const },
];

/* ── Main widget ─────────────────────────────────────────────────────────── */

export default function GA4Widget({
  dragHandle,
  settingsHref,
}: {
  dragHandle?: ReactNode;
  settingsHref?: string;
}) {
  const __ = useAdminTranslations();
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30');

  const { data, isLoading, error } = trpc.analytics.overview.useQuery(
    { days: period },
    { refetchOnWindowFocus: false, retry: false }
  );

  // Not configured state
  if (data && !data.configured) {
    return (
      <div className="card flex flex-col overflow-hidden">
        <div className="widget-header">
          <div className="flex items-center gap-2">
            {dragHandle}
            <h2 className="h2 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-(--text-muted)" />
              {__('Google Analytics')}
            </h2>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <BarChart3 className="h-10 w-10 text-(--text-muted)" />
          <p className="text-sm text-(--text-secondary)">
            {__('Connect Google Analytics to see page views, sessions, and top pages.')}
          </p>
          {settingsHref && (
            <Link
              href={settingsHref}
              className="btn btn-primary mt-2"
            >
              <ExternalLink className="h-4 w-4" />
              {__('Configure in Settings')}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="widget-header">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="h2 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-(--text-muted)" />
            {__('Google Analytics')}
          </h2>
        </div>

        {/* Period toggle */}
        <div className="flex gap-1 rounded-md bg-(--surface-secondary) p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                period === p.value
                  ? 'bg-(--surface-primary) text-(--text-primary) shadow-sm'
                  : 'text-(--text-muted) hover:text-(--text-secondary)'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="m-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {__('Failed to load analytics data. Check your GA4 configuration in Settings.')}
        </div>
      )}

      {/* Data */}
      {data && data.configured && (
        <div className="p-4">
          {/* Stat cards */}
          <div className="ga4-stats-grid grid grid-cols-2 gap-4">
            <div className="ga4-stat-card rounded-lg bg-(--surface-secondary) p-4">
              <div className="ga4-stat-label flex items-center gap-2 text-sm text-(--text-muted)">
                <Eye className="h-4 w-4" />
                {__('Page Views')}
              </div>
              <p className="ga4-stat-value mt-1 text-2xl font-semibold text-(--text-primary)">
                {data.totalPageViews.toLocaleString()}
              </p>
            </div>
            <div className="ga4-stat-card rounded-lg bg-(--surface-secondary) p-4">
              <div className="ga4-stat-label flex items-center gap-2 text-sm text-(--text-muted)">
                <Users className="h-4 w-4" />
                {__('Sessions')}
              </div>
              <p className="ga4-stat-value mt-1 text-2xl font-semibold text-(--text-primary)">
                {data.totalSessions.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="ga4-chart-section mt-4">
            <h3 className="text-sm font-medium text-(--text-secondary)">
              {__('Daily Page Views')}
            </h3>
            <div className="ga4-chart-wrapper mt-2">
              <SimpleLineChart data={data.dailyViews} />
            </div>
          </div>

          {/* Top pages table */}
          {data.topPages.length > 0 && (
            <div className="ga4-top-pages mt-4">
              <h3 className="text-sm font-medium text-(--text-secondary)">
                {__('Top Pages')}
              </h3>
              <div className="ga4-table-wrapper mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-thead">
                      <th className="table-th text-left">{__('Page')}</th>
                      <th className="table-th text-right">{__('Views')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPages.map((page) => (
                      <tr
                        key={page.path}
                        className="border-b border-(--border-primary)"
                      >
                        <td className="ga4-page-path py-2 pr-4 text-(--text-primary) font-mono text-xs">
                          {page.path}
                        </td>
                        <td className="ga4-page-views py-2 text-right tabular-nums text-(--text-secondary)">
                          {page.views.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
