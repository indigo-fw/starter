/**
 * Activity dashboard widget registration.
 *
 * To add the activity widget to the dashboard:
 * 1. Import this file in src/config/dashboard-widgets.tsx
 * 2. Add the widget definition to DASHBOARD_WIDGETS array:
 *    { id: 'activity-feed', label: 'Activity Feed', colSpan: 12, minSpan: 6, maxSpan: 12, defaultVisible: true }
 * 3. Add the component to DASHBOARD_WIDGET_COMPONENTS map:
 *    'activity-feed': ActivityFeedWidget
 *
 * Or simply merge these exports into your existing dashboard-widgets.tsx file.
 */

import type { ReactNode } from 'react';
import { Activity } from 'lucide-react';
import Link from 'next/link';

import { useAdminTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import DashboardActivityWidget from '@/core-activity/components/DashboardActivityWidget';

export function ActivityFeedWidget({ dragHandle }: { dragHandle?: ReactNode }) {
  const __ = useAdminTranslations();

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="widget-header">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="h2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-(--text-muted)" />
            {__('Activity Feed')}
          </h2>
        </div>
        <Link
          href={adminPanel.activity}
          className="text-xs font-medium text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          {__('View all')}
        </Link>
      </div>
      <DashboardActivityWidget />
    </div>
  );
}
