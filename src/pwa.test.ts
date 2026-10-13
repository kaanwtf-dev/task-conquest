import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPWA, requestPersistentStorage } from './pwa';

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
