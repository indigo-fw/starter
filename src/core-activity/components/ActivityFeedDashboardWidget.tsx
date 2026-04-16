'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';

import { useAdminTranslations } from '@/lib/translations';
import { DashboardActivityWidget } from './DashboardActivityWidget';

export function ActivityFeedDashboardWidget({ dragHandle }: { dragHandle?: ReactNode }) {
  const __ = useAdminTranslations();

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="widget-header">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="h2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-(--text-muted)" />
            {__('Activity Feed')}
          </h2>
        </div>
        <Link
          href="/dashboard/activity"
          className="text-xs font-medium text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          {__('View all')}
        </Link>
      </div>
      <DashboardActivityWidget />
    </div>
  );
}
