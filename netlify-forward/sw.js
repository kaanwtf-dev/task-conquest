// Replaces the old app's service worker: removes its offline copy, unregisters itself, and sends every open
// window to the new address (GitHub Pages).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k);
      await self.registration.unregister();
      const wins = await self.clients.matchAll({ type: 'window' });
      for (const w of wins) {
        const u = new URL(w.url);
        w.navigate('https://kaanwtf-dev.github.io/task-conquest' + u.pathname + u.search + u.hash).catch(() => {});
      }
    })(),
  );
});
