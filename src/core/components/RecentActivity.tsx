'use client';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { formatRelativeTime } from '@/core/lib/infra/datetime';

export default function RecentActivity() {
  const __ = useAdminTranslations();
  const { data, isLoading } = trpc.audit.recent.useQuery({ limit: 10 });

  const actionLabel = (action: string) => {
    const labels: Record<string, string> = {
      create: __('created'),
      update: __('updated'),
      delete: __('deleted'),
      restore: __('restored'),
      publish: __('published'),
    };
    return labels[action] ?? action;
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-sm text-(--text-muted)">
        {__('Loading...')}
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="p-4 text-sm text-(--text-muted)">
        {__('No activity recorded yet.')}
      </div>
    );
  }

  return (
    <div className="activity-list divide-y divide-(--border-secondary)">
      {data.map((entry) => (
        <div key={entry.id} className="activity-item flex items-center gap-3 px-4 py-2.5 text-sm">
          <div className="activity-content min-w-0 flex-1">
            <span className="activity-actor font-medium text-(--text-primary)">
              {entry.userName ?? __('System')}
            </span>
            {' '}
            <span className="activity-action text-(--text-muted)">
              {actionLabel(entry.action)}
            </span>
            {' '}
            <span className="activity-entity text-(--text-secondary)">
              {entry.entityTitle ?? entry.entityType}
            </span>
          </div>
          <time className="activity-time shrink-0 text-xs tabular-nums text-(--text-muted)">
            {formatRelativeTime(entry.createdAt)}
          </time>
        </div>
      ))}
    </div>
  );
}
