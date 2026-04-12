'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';

type PushState = 'unsupported' | 'disabled' | 'prompt' | 'denied' | 'subscribed' | 'loading';

/**
 * Hook for managing Web Push notification subscriptions.
 *
 * Returns the current push state and a toggle function.
 * No-op if VAPID is not configured or browser doesn't support push.
 *
 * Auto-re-registers if the browser has an active subscription but the
 * server doesn't (e.g. after maintenance cleanup or DB reset).
 */
export function usePushNotifications() {
  const isSupported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window;

  const resynced = useRef(false);

  const { data: pushEnabled } = trpc.notifications.pushEnabled.useQuery();
  const { data: pushStatus } = trpc.notifications.pushStatus.useQuery();
  const subscribe = trpc.notifications.pushSubscribe.useMutation();
  const unsubscribe = trpc.notifications.pushUnsubscribe.useMutation();
  const utils = trpc.useUtils();

  // Derive state from server data + browser capabilities — no setState needed
  const state = useMemo<PushState>(() => {
    if (!isSupported) return 'unsupported';
    if (pushEnabled === false) return 'disabled';
    if (pushEnabled === undefined || pushStatus === undefined) return 'loading';
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied';
    return pushStatus.subscriptionCount > 0 ? 'subscribed' : 'prompt';
  }, [isSupported, pushEnabled, pushStatus]);

  /** Optimistically update pushStatus cache so useMemo recomputes instantly. */
  const optimisticSetCount = useCallback((count: number) => {
    utils.notifications.pushStatus.setData(undefined, (old) =>
      old ? { ...old, subscriptionCount: count } : { subscriptionCount: count },
    );
  }, [utils]);

  // Auto-re-register: browser has subscription but server lost it
  useEffect(() => {
    if (state !== 'prompt' || resynced.current) return;
    if (Notification.permission !== 'granted') return;

    resynced.current = true;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!existing) return;

        const json = existing.toJSON();
        if (!json.keys?.p256dh || !json.keys?.auth) return;

        await subscribe.mutateAsync({
          endpoint: existing.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        });
        optimisticSetCount(1);
        utils.notifications.pushStatus.invalidate();
      } catch {
        // Silent — don't break the UI over a resync failure
      }
    })();
  }, [state, subscribe, utils, optimisticSetCount]);

  const toggle = useCallback(async () => {
    if (state === 'subscribed') {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await unsubscribe.mutateAsync({ endpoint: existing.endpoint });
        await existing.unsubscribe();
      }
      optimisticSetCount(0);
      utils.notifications.pushStatus.invalidate();
      return;
    }

    if (state === 'prompt' || state === 'denied') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      const json = subscription.toJSON();
      await subscribe.mutateAsync({
        endpoint: subscription.endpoint,
        p256dh: json.keys!.p256dh!,
        auth: json.keys!.auth!,
      });

      optimisticSetCount(1);
      utils.notifications.pushStatus.invalidate();
    }
  }, [state, subscribe, unsubscribe, utils, optimisticSetCount]);

  return {
    state,
    /** Whether push is available (supported + configured). */
    available: state !== 'unsupported' && state !== 'disabled' && state !== 'loading',
    /** Whether currently subscribed. */
    subscribed: state === 'subscribed',
    /** Toggle subscription on/off. */
    toggle,
    /** Whether a toggle operation is in progress. */
    loading: subscribe.isPending || unsubscribe.isPending || state === 'loading',
  };
}

/** Convert URL-safe base64 VAPID key to Uint8Array for pushManager.subscribe(). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}
