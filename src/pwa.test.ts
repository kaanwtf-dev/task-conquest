import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPWA, requestPersistentStorage } from './pwa';

type Opts = {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (url: string, reg: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (err: unknown) => void;
};
const registerSW = vi.fn<(opts: Opts) => (reload?: boolean) => Promise<void>>();
vi.mock('virtual:pwa-register', () => ({ registerSW: (opts: Opts) => registerSW(opts) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerPWA', () => {
  it('is a no-op outside production builds', () => {
    const needRefresh = vi.fn();
    const offline = vi.fn();
    expect(() => registerPWA(needRefresh, offline)).not.toThrow();
    expect(needRefresh).not.toHaveBeenCalled();
    expect(offline).not.toHaveBeenCalled();
    expect(registerSW).not.toHaveBeenCalled();
  });
});

describe('registerPWA in a production build', () => {
  const listeners: Record<string, () => void> = {};
  const doc = { visibilityState: 'visible', addEventListener: (type: string, fn: () => void) => (listeners[type] = fn) };
  const nav = { serviceWorker: {}, onLine: true };
  const updateSW = vi.fn(async (_reload?: boolean) => undefined);

  beforeEach(() => {
    vi.resetModules(); // fresh module: registration is once per page
    vi.useFakeTimers();
    vi.stubEnv('PROD', true);
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', nav);
    nav.onLine = true;
    registerSW.mockReset().mockImplementation(() => updateSW);
    updateSW.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  async function register(onNeedRefresh = vi.fn(), onOfflineReady = vi.fn()) {
    const pwa = await import('./pwa');
    pwa.registerPWA(onNeedRefresh, onOfflineReady);
    await vi.dynamicImportSettled();
    return { pwa, onNeedRefresh, onOfflineReady, opts: registerSW.mock.calls[0]?.[0] };
  }

  it('registers once, however often it is called', async () => {
    const { pwa, opts, onOfflineReady } = await register();
    pwa.registerPWA(vi.fn());
    pwa.registerPWA(vi.fn());
    await vi.dynamicImportSettled();
    expect(registerSW).toHaveBeenCalledTimes(1);
    expect(opts?.onOfflineReady).toBe(onOfflineReady);
  });

  it('hands onNeedRefresh an update that activates the waiting worker', async () => {
    const { opts, onNeedRefresh } = await register();
    opts?.onNeedRefresh?.();
    expect(onNeedRefresh).toHaveBeenCalledTimes(1);
    const update = onNeedRefresh.mock.calls[0][0] as () => void;
    expect(updateSW).not.toHaveBeenCalled();
    update();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('checks for a new deploy hourly and on refocus, only online and not mid-install', async () => {
    const { opts } = await register();
    const reg = { installing: null as unknown, update: vi.fn(async () => undefined) };
    opts?.onRegisteredSW?.('sw.js', reg as unknown as ServiceWorkerRegistration);
    expect(reg.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(reg.update).toHaveBeenCalledTimes(1);
    listeners.visibilitychange();
    expect(reg.update).toHaveBeenCalledTimes(2);
    nav.onLine = false;
    vi.advanceTimersByTime(60 * 60 * 1000);
    listeners.visibilitychange();
    nav.onLine = true;
    reg.installing = {};
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(reg.update).toHaveBeenCalledTimes(2);
  });

  it('survives a failed update check and a missing registration', async () => {
    const { opts } = await register();
    expect(() => opts?.onRegisteredSW?.('sw.js', undefined)).not.toThrow();
    const reg = { installing: null, update: vi.fn(() => Promise.reject(new Error('offline'))) };
    opts?.onRegisteredSW?.('sw.js', reg as unknown as ServiceWorkerRegistration);
    expect(() => vi.advanceTimersByTime(60 * 60 * 1000)).not.toThrow();
    expect(reg.update).toHaveBeenCalled();
  });

  it('does nothing without service worker support and warns instead of throwing on failure', async () => {
    vi.stubGlobal('navigator', {});
    await register();
    expect(registerSW).not.toHaveBeenCalled();

    vi.resetModules();
    vi.stubGlobal('navigator', nav);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerSW.mockImplementation(() => {
      throw new Error('blocked');
    });
    await register();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('requestPersistentStorage', () => {
  it('resolves false without the StorageManager API', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('does not ask again when storage is already persistent', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persisted: async () => true, persist } });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks for persistence and reports the answer', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => false } });
    await expect(requestPersistentStorage()).resolves.toBe(false);
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => true } });
    await expect(requestPersistentStorage()).resolves.toBe(true);
  });

  it('swallows errors', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        persisted: async () => false,
        persist: async () => {
          throw new Error('denied');
        },
      },
    });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });
});
