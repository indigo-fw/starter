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

  const options = {
    body: payload.body || '',
    tag: payload.type || 'default',
    data: {
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
