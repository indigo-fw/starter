'use client';

import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';

import type { DashboardWidgetDef } from '@/core/config/dashboard-widgets';
import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import GA4Widget from '@/core/components/dashboard/GA4Widget';
import RecentActivity from '@/core/components/dashboard/RecentActivity';
import ContentStatusWidget from '@/core/components/dashboard/ContentStatusWidget';
import type { ContentStatusEntry } from '@/core/components/dashboard/ContentStatusWidget';
import { PostType } from '@/core/types/cms';
import QuickActionsWidget from '@/components/admin/QuickActionsWidget';

export type { DashboardWidgetDef } from '@/core/config/dashboard-widgets';

// ── Widget component type ──────────────────────────────────
export type WidgetComponent = ComponentType<{ dragHandle?: ReactNode }>;

// ── RecentActivity wrapper ─────────────────────────────────
function RecentActivityWidget({ dragHandle }: { dragHandle?: ReactNode }) {
  const __ = useAdminTranslations();

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="widget-header">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="h2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-(--text-muted)" />
            {__('Recent Activity')}
          </h2>
        </div>
        <Link
          href={adminPanel.activity}
          className="text-xs font-medium text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          {__('View all')}
        </Link>
      </div>
      <RecentActivity />
    </div>
  );
}

// ── ContentStatus wrapper (injects project-specific post types) ──
const CONTENT_STATUS_ENTRIES: ContentStatusEntry[] = [
  { type: PostType.PAGE, publishedLabel: 'Published pages', draftLabel: 'Draft pages' },
  { type: PostType.BLOG, publishedLabel: 'Published posts', draftLabel: 'Draft posts' },
];

function ContentStatusWidgetWrapper({ dragHandle }: { dragHandle?: ReactNode }) {
  return <ContentStatusWidget dragHandle={dragHandle} entries={CONTENT_STATUS_ENTRIES} />;
}

// ── GA4 wrapper (injects settingsHref) ─────────────────────
function GA4WidgetWrapper({ dragHandle }: { dragHandle?: ReactNode }) {
  return <GA4Widget dragHandle={dragHandle} settingsHref={adminPanel.settings} />;
}

// ── Widget definitions ─────────────────────────────────────
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  { id: 'content-status', label: 'Content Status', colSpan: 6, minSpan: 4, maxSpan: 12, defaultVisible: true },
  { id: 'quick-actions', label: 'Quick Actions', colSpan: 6, minSpan: 4, maxSpan: 12, defaultVisible: true },
  { id: 'ga4', label: 'Google Analytics', colSpan: 12, minSpan: 6, maxSpan: 12, defaultVisible: true },
  { id: 'recent-activity', label: 'Recent Activity', colSpan: 12, minSpan: 6, maxSpan: 12, defaultVisible: true },
];

export const DEFAULT_WIDGET_ORDER = DASHBOARD_WIDGETS.map((w) => w.id);

export const DEFAULT_HIDDEN_WIDGETS: string[] = [];

/**
 * Widget component registry.
 * To add a new dashboard widget: add a DashboardWidgetDef above and map its id here.
 */
export const DASHBOARD_WIDGET_COMPONENTS: Record<string, WidgetComponent> = {
  'content-status': ContentStatusWidgetWrapper,
  'quick-actions': QuickActionsWidget,
  'ga4': GA4WidgetWrapper,
  'recent-activity': RecentActivityWidget,
};
