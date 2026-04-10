'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/core/lib/infra/datetime';

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-danger-500 rounded-full">
            {unreadCount! > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full bottom-0 ml-2 w-80 card shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-(--border-primary)">
            <span className="font-semibold text-sm">{__('Notifications')}</span>
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
                  'w-full text-left px-4 py-3 border-b border-(--border-primary) hover:bg-(--surface-secondary) transition-colors',
                  !n.read && 'bg-(--surface-secondary)'
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-(--text-secondary) mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                    <p className="text-xs text-(--text-tertiary) mt-1">
                      {formatRelativeTime(n.createdAt)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <a
            href={notificationsHref}
            className="block text-center text-xs text-brand-500 hover:underline px-4 py-3 border-t border-(--border-primary)"
          >
            {__('View all notifications')}
          </a>
        </div>
      )}
    </div>
  );
}
