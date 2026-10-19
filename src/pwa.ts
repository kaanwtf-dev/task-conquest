/// <reference types="vite-plugin-pwa/client" />
// Service worker registration (prompt-to-update) and persistent storage for the local-first save.

const UPDATE_CHECK_MS = 60 * 60 * 1000;

let registered = false;

/**
 * Registers the service worker in production builds (no-op in dev and tests; later calls are ignored).
 * `onNeedRefresh` receives `update`, which activates the waiting worker and reloads the page.
 */
export function registerPWA(onNeedRefresh: (update: () => void) => void, onOfflineReady?: () => void): void {
  if (registered || !import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  registered = true;
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      let registration: ServiceWorkerRegistration | undefined;
      const updateSW = registerSW({
        onNeedRefresh: () => onNeedRefresh(() => applyUpdate(updateSW, registration)),
        onOfflineReady,
        onRegisteredSW(_url, reg) {
          if (!reg) return;
          registration = reg;
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

/** How long Update waits for the new version before reloading anyway. */
const UPDATE_FALLBACK_MS = 3000;

/**
 * Switches to the waiting new version and reloads. iPhone Home Screen apps don't always report the switch
 * (no controllerchange), which left the Update button doing nothing until a relaunch: so the page also
 * reloads as soon as the new worker is active, and after a few seconds in any case.
 */
function applyUpdate(updateSW: (reload?: boolean) => Promise<void>, reg: ServiceWorkerRegistration | undefined): void {
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener?.('controllerchange', reload, { once: true });
  void updateSW(true).catch(() => undefined);
  reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  const started = Date.now();
  const poll = setInterval(() => {
    const switched = !!reg && !reg.waiting && reg.active?.state === 'activated';
    if (switched || Date.now() - started > UPDATE_FALLBACK_MS) {
      clearInterval(poll);
      reload();
    }
  }, 150);
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
