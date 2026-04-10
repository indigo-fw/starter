'use client';

import { useAdminTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/core/lib/infra/datetime';
import { Bell, Check, Trash2 } from 'lucide-react';

export default function NotificationsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.notifications.list.useQuery({ limit: 50 });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const deleteNotification = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="h2">{__('Notifications')}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="btn btn-secondary btn-sm"
            >
              {__('Mark all read')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
      {isLoading && (
        <div className="text-(--text-secondary)">{__('Loading...')}</div>
      )}

      {data?.items.length === 0 && !isLoading && (
        <div className="empty-state">
          <Bell size={48} className="mx-auto mb-4 text-(--text-tertiary)" />
          <p>{__('No notifications yet')}</p>
        </div>
      )}

      <div className="space-y-2">
        {data?.items.map((n) => (
          <div
            key={n.id}
            className={cn(
              'card px-4 py-3 flex items-start gap-3',
              !n.read && 'border-l-3 border-l-brand-500'
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{n.title}</p>
              <p className="text-sm text-(--text-secondary) mt-0.5">{n.body}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-(--text-tertiary)">
                  {formatRelativeTime(n.createdAt)}
                </span>
                <span className="badge text-xs">{n.category}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!n.read && (
                <button
                  type="button"
                  onClick={() => markRead.mutate({ id: n.id })}
                  className="action-btn"
                  title={__('Mark read')}
                >
                  <Check size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteNotification.mutate({ id: n.id })}
                className="action-btn"
                title={__('Delete')}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div></main>
    </>
  );
}
