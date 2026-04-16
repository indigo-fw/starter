'use client';

import { Activity, Loader2 } from 'lucide-react';
import { useBlankTranslations } from '@/lib/translations';
import { ActivityItem, type ActivityItemEvent } from './ActivityItem';
import '../styles/activity.css';

interface ActivityFeedProps {
  items: ActivityItemEvent[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  loading?: boolean;
  loadingMore?: boolean;
  emptyMessage?: string;
  compact?: boolean;
}

export function ActivityFeed({
  items,
  hasMore,
  onLoadMore,
  loading,
  loadingMore,
  emptyMessage,
  compact,
}: ActivityFeedProps) {
  const __ = useBlankTranslations();

  if (loading) {
    return (
      <div className="activity-empty">
        <Loader2 className="animate-spin" />
        <span>{__('Loading...')}</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="activity-empty">
        <Activity />
        <span>{emptyMessage ?? __('No activity yet.')}</span>
      </div>
    );
  }

  return (
    <div className="activity-feed">
      {items.map((event) => (
        <ActivityItem key={event.id} event={event} compact={compact} />
      ))}
      {hasMore && onLoadMore && (
        <div className="activity-load-more">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? __('Loading...') : __('Load more')}
          </button>
        </div>
      )}
    </div>
  );
}
