'use client';

import {
  FileText, Layers, FolderOpen, Users, Image, CreditCard, TrendingUp,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { PostType } from '@/core/types/cms';
import { adminPanel } from '@/config/routes';
import StatCard from '@/core/components/dashboard/StatCard';
import { DashboardConfig } from '@/core/components/dashboard/DashboardConfig';
import { DASHBOARD_WIDGETS, DEFAULT_WIDGET_ORDER, DEFAULT_HIDDEN_WIDGETS } from '@/config/dashboard-widgets';
import { DashboardWidgetGrid } from '@/components/admin/DashboardWidgetGrid';

export default function DashboardPage() {
  const __ = useAdminTranslations();
  const pageCounts = trpc.cms.counts.useQuery({ type: PostType.PAGE });
  const blogCounts = trpc.cms.counts.useQuery({ type: PostType.BLOG });
  const catCounts = trpc.categories.counts.useQuery();
  const userCounts = trpc.users.counts.useQuery();
  const mediaCounts = trpc.media.count.useQuery();
  const billingStats = trpc.billing.getStats.useQuery(undefined, {
    retry: false, // Don't retry if billing section is not accessible
  });

  return (
    <main className="dash-main"><div className="dash-inner">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Dashboard')}</h1>
          <p className="mt-2 text-(--text-secondary)">{__('Welcome to Indigo admin panel.')}</p>
        </div>
        <DashboardConfig
          widgets={DASHBOARD_WIDGETS}
          defaultOrder={DEFAULT_WIDGET_ORDER}
          defaultHidden={DEFAULT_HIDDEN_WIDGETS}
        />
      </div>

      {/* Stat cards — always visible, not reorderable */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={__('Pages')}
          count={pageCounts.data?.all}
          href={adminPanel.cms('pages')}
          icon={FileText}
          color="blue"
        />
        <StatCard
          label={__('Blog Posts')}
          count={blogCounts.data?.all}
          href={adminPanel.cms('blog')}
          icon={Layers}
          color="green"
        />
        <StatCard
          label={__('Categories')}
          count={catCounts.data?.all}
          href={adminPanel.cms('categories')}
          icon={FolderOpen}
          color="orange"
        />
        <StatCard
          label={__('Users')}
          count={userCounts.data?.all}
          href={adminPanel.users}
          icon={Users}
          color="purple"
        />
        <StatCard
          label={__('Media Files')}
          count={mediaCounts.data?.count}
          href={adminPanel.media}
          icon={Image}
          color="blue"
        />
      </div>

      {/* Billing stat cards — only shown when billing stats are available */}
      {billingStats.data && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label={__('Active Subscriptions')}
            count={billingStats.data.totalActive}
            href={adminPanel.settingsBilling}
            icon={CreditCard}
            color="green"
          />
          <StatCard
            label={__('MRR')}
            count={Math.round(billingStats.data.mrr / 100)}
            href={adminPanel.settingsBilling}
            icon={TrendingUp}
            color="blue"
          />
          <StatCard
            label={__('Churn (30d)')}
            count={billingStats.data.churn.canceled30d}
            href={adminPanel.settingsBilling}
            icon={Users}
            color="orange"
          />
        </div>
      )}

      {/* Configurable widget grid with drag-and-drop */}
      <DashboardWidgetGrid />
    </div></main>
  );
}
