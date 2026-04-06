'use client';

import { Suspense, useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdminTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { SubscriptionSummary } from './components/SubscriptionSummary';
import { SubscriptionsTable } from './components/SubscriptionsTable';
import { ChurnedSubscriptionsTable } from './components/ChurnedSubscriptionsTable';
import { DiscountCodesTable } from './components/DiscountCodesTable';
import { RevenueChart } from './components/RevenueChart';
import { RecentTransactionsTable } from './components/RecentTransactionsTable';
import { PAGE_WIDGETS } from '@/generated/module-page-widgets';

// ─── Date helpers (pure — no mutation) ──────────────────────────────────────

const DATE_PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '180 days', days: 180 },
  { label: '1 year', days: 365 },
  { label: 'All time', days: 0 },
] as const;

const PLAN_OPTIONS = [
  { value: '', label: 'All Plans' },
  { value: 'free', label: 'Free' },
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
] as const;

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'past_due', label: 'Past Due' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'unpaid', label: 'Unpaid' },
] as const;

function toISOStart(dateStr: string): string {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function toISOEnd(dateStr: string): string {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function nowISO(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

// ─── Suspense wrapper ───────────────────────────────────────────────────────

export default function BillingDashboardPage() {
  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">Subscriptions</h1>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
        <Suspense fallback={<div className="text-(--text-muted)">Loading...</div>}>
          <BillingDashboardContent />
        </Suspense>
      </div></main>
    </>
  );
}

// ─── Dashboard content ──────────────────────────────────────────────────────

function BillingDashboardContent() {
  const __ = useAdminTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── Sticky filter bar ──────────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry) setIsStuck(!entry.isIntersecting); },
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // ─── URL-persisted filters ──────────────────────────────────────────────
  const initialPreset = Number(searchParams.get('days') ?? 30);
  const initialPlan = searchParams.get('plan') ?? '';
  const initialStatus = searchParams.get('status') ?? '';
  const initialCustomFrom = searchParams.get('from') ?? '';
  const initialCustomTo = searchParams.get('to') ?? '';

  const [preset, setPreset] = useState(initialPreset === -1 ? -1 : initialPreset);
  const [planFilter, setPlanFilter] = useState(initialPlan);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [customFrom, setCustomFrom] = useState(initialCustomFrom);
  const [customTo, setCustomTo] = useState(initialCustomTo);
  const isCustom = preset === -1;

  // Persist filters to URL
  const syncURL = useCallback(() => {
    const params = new URLSearchParams();
    if (preset !== 30) params.set('days', String(preset));
    if (planFilter) params.set('plan', planFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (isCustom && customFrom) params.set('from', customFrom);
    if (isCustom && customTo) params.set('to', customTo);
    const qs = params.toString();
    router.replace(`?${qs}`, { scroll: false });
  }, [preset, planFilter, statusFilter, customFrom, customTo, isCustom, router]);

  useEffect(() => { syncURL(); }, [syncURL]);

  // ─── Compute date range ─────────────────────────────────────────────────
  const { from, to } = useMemo(() => {
    if (isCustom) {
      return {
        from: customFrom ? toISOStart(customFrom) : undefined,
        to: customTo ? toISOEnd(customTo) : undefined,
      };
    }
    if (preset === 0) return { from: undefined, to: undefined };
    return { from: daysAgoISO(preset), to: nowISO() };
  }, [preset, customFrom, customTo, isCustom]);

  // ─── Data ───────────────────────────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = trpc.billing.getStats.useQuery({ from, to });

  return (
    <div className="mx-auto max-w-320">
      {/* Subtitle */}
      <p className="mb-6 text-sm text-(--text-secondary)">
        {__('Monitor revenue, track churn, and manage subscriptions.')}
      </p>

      {/* Sentinel for sticky detection */}
      <div ref={sentinelRef} className="h-0" />

      {/* ─── Sticky filter bar ─────────────────────────────────────────── */}
      <div
        className={cn(
          'sticky top-0 z-50 -mx-6 px-6 py-3 flex flex-wrap items-center gap-3',
          'transition-[background-color,border-color,box-shadow] duration-200',
          isStuck
            ? 'bg-(--surface-primary) border-b border-b-(--border-primary) shadow-sm'
            : 'border-b border-transparent'
        )}
      >
        {/* Date preset */}
        <select
          value={preset}
          onChange={(e) => setPreset(Number(e.target.value))}
          className="filter-select"
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.days} value={p.days}>{__(p.label)}</option>
          ))}
          <option value={-1}>{__('Custom range')}</option>
        </select>

        {/* Custom date inputs */}
        {isCustom && (
          <>
            <label className="text-sm text-(--text-secondary)">{__('From')}</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="filter-select"
            />
            <label className="text-sm text-(--text-secondary)">{__('To')}</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="filter-select"
            />
          </>
        )}

        {/* Plan filter */}
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="filter-select"
        >
          {PLAN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{__(o.label)}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="filter-select"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{__(o.label)}</option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Active range label */}
        {!isCustom && preset > 0 && (
          <span className="text-xs text-(--text-muted)">
            {__('Last')} {preset} {__('days')}
          </span>
        )}
        {!isCustom && preset === 0 && (
          <span className="text-xs text-(--text-muted)">{__('All time')}</span>
        )}
      </div>

      {/* ─── Summary KPIs ──────────────────────────────────────────────── */}
      <div className="mt-6">
        <SubscriptionSummary data={stats} isLoading={statsLoading} />
      </div>

      {/* ─── Revenue chart ─────────────────────────────────────────────── */}
      <div className="mt-6">
        <RevenueChart from={from} to={to} />
      </div>

      {/* ─── Recent transactions ───────────────────────────────────────── */}
      <div className="mt-6">
        <RecentTransactionsTable
          transactions={stats?.recentTransactions}
          isLoading={statsLoading}
        />
      </div>

      {/* ─── Active subscriptions ──────────────────────────────────────── */}
      <div className="mt-6">
        <SubscriptionsTable
          from={from}
          to={to}
          planFilter={planFilter}
          statusFilter={statusFilter}
        />
      </div>

      {/* ─── Churned subscriptions ─────────────────────────────────────── */}
      <div className="mt-6">
        <ChurnedSubscriptionsTable from={from} to={to} />
      </div>

      {/* ─── Discount codes ────────────────────────────────────────────── */}
      <div className="mt-6">
        <DiscountCodesTable />
      </div>

      {/* ─── Module widgets (e.g. affiliates overview) ─────────────────── */}
      {(PAGE_WIDGETS.billing ?? []).map((Widget, i) => (
        <div key={i} className="mt-6 mb-8">
          <Widget />
        </div>
      ))}
    </div>
  );
}
