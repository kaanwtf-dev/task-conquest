// Reminder notifications, loaded into the generated service worker (vite.config.ts: workbox.importScripts).
// The sender's messages are Declarative Web Push JSON: newer Safari shows them without running this file;
// everywhere else they arrive here. Every push must show a notification, whatever happens: iOS withdraws
// push permission from apps that receive three it did not show.
/* eslint-env serviceworker */
self.addEventListener('push', (event) => {
  const scope = self.registration.scope;
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = {};
  }
  const n = msg && typeof msg.notification === 'object' && msg.notification ? msg.notification : msg;
  const url = typeof n.navigate === 'string' && n.navigate.startsWith(scope) ? n.navigate : scope;
  const shown = self.registration.showNotification(typeof n.title === 'string' && n.title ? n.title : 'Questlog', {
    body: typeof n.body === 'string' ? n.body : 'Your quests await.',
    tag: typeof n.tag === 'string' ? n.tag : 'questlog',
    icon: scope + 'icon-192.png',
    data: { url },
  });
  // the home-screen icon shows how many quests are left today
  const badge = Number(msg.app_badge);
  const nav = self.navigator;
  let badged = Promise.resolve();
  try {
    if (Number.isFinite(badge) && nav && nav.setAppBadge) badged = (badge > 0 ? nav.setAppBadge(badge) : nav.clearAppBadge()).catch(() => undefined);
  } catch {
    // badges are a nicety
  }
  event.waitUntil(Promise.all([shown, badged]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  const url = (event.notification.data && event.notification.data.url) || scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(scope));
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
