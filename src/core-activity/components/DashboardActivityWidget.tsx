'use client';

import { Loader2, Activity } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { ActivityItem } from './ActivityItem';
import '../styles/activity.css';

export default function DashboardActivityWidget() {
  const __ = useAdminTranslations();
  const { data, isLoading } = trpc.activity.adminFeed.useQuery({
    page: 1,
    pageSize: 8,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  const items = data?.results ?? [];

  if (items.length === 0) {
    return (
      <div className="activity-empty">
        <Activity />
        <span>{__('No recent activity')}</span>
      </div>
    );
  }

  return (
    <div className="activity-feed">
      {items.map((event) => (
        <ActivityItem key={event.id} event={event} compact />
      ))}
    </div>
  );
}
