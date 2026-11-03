// scratch: two devices of one player through the fake cloud (copied from src/state/twoDevices.test.ts)
import { vi } from 'vitest';
import { FakeServer, FakeRemote } from '../../sync/fakeCloud';
import { SyncEngine } from '../../sync/engine';
import { heroGold } from '../../game/progression';

export const U = 'uuuuuuuu-0000-4000-8000-000000000001';
export const APP = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' } as never;
type StoreMod = typeof import('../../state/store');

export async function freshStore(): Promise<StoreMod> {
  vi.resetModules();
  return import('../../state/store');
}
export function dev(server: FakeServer, mod: StoreMod) {
  const useStore = mod.useStore;
  const kv = new Map<string, string>();
  const remote = new FakeRemote(server, U);
  const engine = new SyncEngine(
    {
      get deviceId() { return useStore.getState().deviceId; },
      read: () => { const s = useStore.getState(); return { hero: s.hero, lists: s.lists, tasks: s.tasks, items: s.items, potions: s.potions }; },
      write: (p) => useStore.setState(p as never),
    },
    remote,
    { get: (k) => kv.get(k) ?? null, set: (k, v) => void kv.set(k, v) },
    U,
    { intervalMs: 0, pushDelayMs: 1 },
  );
  let fresh = true;
  mod.syncHooks.busy = () => !fresh;
  const sync = async () => {
    await engine.syncNow();
    server.deliver();
    await engine.syncNow();
    fresh = true;
  };
  const sleep = () => void (fresh = false);
  return { st: () => useStore.getState(), useStore, engine, remote, sync, sleep, gold: () => heroGold(useStore.getState().hero!) };
}
export type Dev = ReturnType<typeof dev>;
export const at = (m: number, d: number, h: number, mi = 0) => vi.setSystemTime(new Date(2026, m, d, h, mi));
export const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));

export async function setup(title = 'Drink water') {
  const server = new FakeServer();
  const P = dev(server, await freshStore());
  const M = dev(server, await freshStore());
  P.st().resetAll();
  P.st().createHero('Kaan', APP, 'knight');
  P.useStore.setState({ accountId: U } as never);
  M.useStore.setState({ accountId: U } as never);
  const list = Object.values(P.st().lists).find((l) => l.type === 'daily' && !l.deleted)!;
  for (const t of Object.values(P.st().tasks)) P.st().deleteTask(t.id);
  P.st().addTask(list.id, title);
  const id = Object.values(P.st().tasks).find((t) => t.title === title && !t.deleted)!.id;
  P.useStore.setState((x) => ({ hero: { ...x.hero!, gold: { ...x.hero!.gold, seed: 1900 }, updatedAt: Date.now() } }) as never);
  await P.sync();
  await M.sync();
  return { server, P, M, id, listId: list.id };
}
