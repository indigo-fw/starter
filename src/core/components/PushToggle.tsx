'use client';

import { BellRing, BellOff } from 'lucide-react';
import { usePushNotifications } from '@/core/lib/push/use-push-notifications';

interface PushToggleProps {
  __: (key: string) => string;
  /** Compact mode for embedding in dropdowns. */
  compact?: boolean;
}

/**
 * Toggle button for enabling/disabling web push notifications.
 * Renders nothing if push is unsupported or VAPID not configured.
 */
export function PushToggle({ __, compact }: PushToggleProps) {
  const { available, subscribed, toggle, loading, state } = usePushNotifications();

  if (!available) return null;

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={loading || state === 'denied'}
        className="flex items-center gap-2 w-full text-xs px-4 py-2 hover:bg-(--surface-secondary) transition-colors disabled:opacity-50"
        title={state === 'denied' ? __('Push notifications blocked by browser') : undefined}
      >
        {subscribed ? (
          <BellRing className="h-3.5 w-3.5 text-brand-500" />
        ) : (
          <BellOff className="h-3.5 w-3.5 text-(--text-tertiary)" />
        )}
        <span>{subscribed ? __('Push enabled') : __('Enable push')}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading || state === 'denied'}
      className="btn btn-sm flex items-center gap-2 disabled:opacity-50"
      title={state === 'denied' ? __('Push notifications blocked by browser') : undefined}
    >
      {subscribed ? (
        <>
          <BellRing className="h-4 w-4" />
          {__('Push notifications on')}
        </>
      ) : (
        <>
          <BellOff className="h-4 w-4" />
          {__('Enable push notifications')}
        </>
      )}
    </button>
  );
}
