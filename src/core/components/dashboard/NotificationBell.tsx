'use client';

import { useRef, useState } from 'react';

import { Bell } from 'lucide-react';

import { PushToggle } from '@/core/components/PushToggle';
import { useCloseOnClickOutside } from '@/core/hooks/useCloseOnClickOutside';
import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { formatRelativeTime } from '@/core/lib/infra/datetime';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  notificationsHref: string;
}

export function NotificationBell({ notificationsHref }: NotificationBellProps) {
  const __ = useAdminTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );

  const { data: notifications } = trpc.notifications.list.useQuery(
    { limit: 10 },
    { enabled: open }
  );

  const markRead = trpc.notifications.markRead.useMutation();
  const markAllRead = trpc.notifications.markAllRead.useMutation();
  const utils = trpc.useUtils();

  useCloseOnClickOutside(ref, () => setOpen(false), { enabled: open });

  const handleMarkRead = async (id: string) => {
    await markRead.mutateAsync({ id });
    utils.notifications.unreadCount.invalidate();
    utils.notifications.list.invalidate();
  };

  const handleMarkAllRead = async () => {
    await markAllRead.mutateAsync();
    utils.notifications.unreadCount.invalidate();
    utils.notifications.list.invalidate();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="dash-rail-btn relative"
        title={__('Notifications')}
      >
        <Bell className="h-5 w-5" />
        {(unreadCount ?? 0) > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white">
            {unreadCount! > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="card absolute bottom-0 left-full z-50 ml-2 w-80 overflow-hidden shadow-lg">
          <div className="flex items-center justify-between border-b border-(--border-primary) px-4 py-3">
            <span className="text-sm font-semibold">{__('Notifications')}</span>
            {(unreadCount ?? 0) > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-brand-500 hover:underline"
              >
                {__('Mark all read')}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications?.items.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-(--text-secondary)">
                {__('No notifications')}
              </div>
            )}
            {notifications?.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) handleMarkRead(n.id);
                  if (n.actionUrl) window.location.href = n.actionUrl;
                }}
                className={cn(
                  'w-full border-b border-(--border-primary) px-4 py-3 text-left transition-colors hover:bg-(--surface-secondary)',
                  !n.read && 'bg-(--surface-secondary)'
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-(--text-secondary)">
                      {n.body}
                    </p>
                    <p className="mt-1 text-xs text-(--text-tertiary)">
                      {formatRelativeTime(n.createdAt)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-(--border-primary)">
            <PushToggle __={__} compact />
            <a
              href={notificationsHref}
              className="block border-t border-(--border-primary) px-4 py-2 text-center text-xs text-brand-500 hover:underline"
            >
              {__('View all notifications')}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
