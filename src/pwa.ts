/// <reference types="vite-plugin-pwa/client" />
// Service worker registration (prompt-to-update) and persistent storage for the local-first save.

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker in production builds (no-op in dev and tests).
 * `onNeedRefresh` receives `update`, which activates the waiting worker and reloads the page.
 */
export function registerPWA(onNeedRefresh: (update: () => void) => void, onOfflineReady?: () => void): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh: () => onNeedRefresh(() => void updateSW(true)),
        onOfflineReady,
        onRegisteredSW(_url, reg) {
          if (!reg) return;
          // an installed app can stay open for days: look for a new deploy hourly and on refocus
          const check = () => {
            if (navigator.onLine && !reg.installing) reg.update().catch(() => undefined);
          };
          setInterval(check, UPDATE_CHECK_MS);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') check();
          });
        },
        onRegisterError: (err) => console.warn('Service worker registration failed', err),
      });
    })
    .catch((err) => console.warn('Service worker unavailable', err));
}

/** Asks the browser not to evict the local save under storage pressure. Resolves to whether storage is persistent. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persist) return false;
    if (await storage.persisted?.()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
