/// <reference lib="webworker" />

/**
 * Service Worker for Web Push notifications.
 * Handles incoming push events and notification clicks.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'New notification', body: event.data.text() };
  }

  // `tag`: a push with the same tag replaces the one already in the tray
  // (chat threads, order updates) instead of stacking up.
  const options = {
    body: payload.body || '',
    tag: payload.tag || payload.type || 'default',
    ...(payload.icon ? { icon: payload.icon } : {}),
    ...(payload.badge ? { badge: payload.badge } : {}),
    data: {
      ...(payload.data || {}),
      actionUrl: payload.actionUrl || '/',
    },
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Notification', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const actionUrl = event.notification.data?.actionUrl || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(actionUrl);
          return;
        }
      }
      // Open new window
      return self.clients.openWindow(actionUrl);
    })
  );
});
