// Missed quests across two devices (a phone and a Mac tab) of one player, syncing through the fake cloud: a
// miss is charged once, never from a save that hasn't heard from the cloud, and a completion always wins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeServer, FakeRemote } from '../sync/fakeCloud';
import { SyncEngine } from '../sync/engine';
import { heroGold } from '../game/progression';
import { alarmsFor } from '../push/alarms';
import { DEFAULT_PUSH_PREFS } from '../push/nudges';

const U = 'uuuuuuuu-0000-4000-8000-000000000001';
const APP = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' } as never;
type StoreMod = typeof import('./store');

async function freshStore(): Promise<StoreMod> {
  vi.resetModules();
  return import('./store');
}
function dev(server: FakeServer, mod: StoreMod) {
  const useStore = mod.useStore;
  const kv = new Map<string, string>();
  const engine = new SyncEngine(
    {
      get deviceId() { return useStore.getState().deviceId; },
      read: () => { const s = useStore.getState(); return { hero: s.hero, lists: s.lists, tasks: s.tasks, items: s.items, potions: s.potions }; },
      write: (p) => useStore.setState(p as never),
    },
    new FakeRemote(server, U),
    { get: (k) => kv.get(k) ?? null, set: (k, v) => void kv.set(k, v) },
    U,
    { intervalMs: 0, pushDelayMs: 1 },
  );
  // as in state/sync.ts: nothing is charged until this copy has heard from the cloud since it woke up
  let fresh = true;
  mod.syncHooks.busy = () => !fresh;
  const sync = async () => {
    await engine.syncNow();
    server.deliver();
    await engine.syncNow();
    fresh = true;
  };
  const sleep = () => void (fresh = false);
  return { st: () => useStore.getState(), useStore, engine, sync, sleep, gold: () => heroGold(useStore.getState().hero!) };
}
const at = (d: number, h: number, m = 0) => vi.setSystemTime(new Date(2026, 9, d, h, m));

let server: FakeServer;
let P: ReturnType<typeof dev>;
let M: ReturnType<typeof dev>;
let id: string;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(21, 10);
  server = new FakeServer();
  P = dev(server, await freshStore());
  M = dev(server, await freshStore());
  P.st().resetAll();
  P.st().createHero('Kaan', APP, 'knight');
  P.useStore.setState({ accountId: U } as never);
  M.useStore.setState({ accountId: U } as never);
  const list = Object.values(P.st().lists).find((l) => l.type === 'daily' && !l.deleted)!;
  P.st().updateList(list.id, { shared: true, name: 'Daily Quests' });
  for (const t of Object.values(P.st().tasks)) P.st().deleteTask(t.id); // only our quest
  P.st().addTask(list.id, 'Read for 15 minutes');
  id = Object.values(P.st().tasks).find((t) => t.title === 'Read for 15 minutes')!.id;
  P.useStore.setState((x) => ({ hero: { ...x.hero!, gold: { ...x.hero!.gold, seed: 1900 }, updatedAt: Date.now() } }) as never);
  await P.sync();
  await M.sync();
  expect(M.st().tasks[id]?.title).toBe('Read for 15 minutes');
});
afterEach(() => vi.useRealTimers());

describe('missed quests on two devices', () => {
  it("a copy that wakes up stale doesn't charge a quest done elsewhere, and doesn't erase the completion", async () => {
    M.sleep(); // the Mac tab went to sleep
    at(22, 21);
    P.st().toggleTask(id);
    await P.sync(); // done on the phone at 9 PM
    const g0 = P.gold();
    at(23, 9);
    M.st().checkDeadlines(); // the Mac wakes: hasn't heard from the cloud yet, so nothing happens
    await M.sync();
    M.st().checkDeadlines(); // now it knows the quest was done
    await M.sync();
    await P.sync();
    expect(P.st().tasks[id].doneFor).toBe('2026-10-22');
    expect(P.st().tasks[id].pendingMiss ?? null).toBeNull();
    expect(P.gold()).toBe(g0);
    expect(M.gold()).toBe(g0);
  });

  it('two devices noticing the same miss charge it once, and "I did it" gives all of it back', async () => {
    const g0 = P.gold();
    at(23, 9);
    P.st().checkDeadlines();
    M.st().checkDeadlines();
    await P.sync();
    await M.sync();
    await P.sync();
    const paid = P.st().tasks[id].pendingMiss!.paid!;
    expect(paid).toBeGreaterThan(0);
    expect(g0 - P.gold()).toBe(paid);
    expect(g0 - M.gold()).toBe(paid);
    at(23, 9, 1);
    P.st().resolveMiss(id, 'done');
    await P.sync();
    await M.sync();
    expect(P.gold()).toBe(g0);
    expect(M.gold()).toBe(g0);
    expect(P.st().tasks[id].misses ?? 0).toBe(0);
  });

  it('an edit from a copy that missed the charge never gets the same day charged again', async () => {
    const g0 = P.gold();
    at(23, 9);
    P.st().checkDeadlines();
    await P.sync(); // the phone charges October 22nd; the Mac hasn't heard
    const g1 = P.gold();
    expect(g1).toBeLessThan(g0);
    at(23, 9, 5);
    M.st().toggleTask(id); // done today on the Mac, from its old copy
    await M.sync();
    await P.sync();
    at(23, 9, 10);
    P.st().checkDeadlines();
    await P.sync();
    await M.sync();
    expect(P.gold()).toBeGreaterThanOrEqual(g1); // the 22nd is not charged twice (today's tick even pays)
    expect(Object.keys(P.st().hero!.penalties ?? {})).toHaveLength(1);
  });

  it('a completion that reaches the cloud after the charge wins, and the gold comes back by itself', async () => {
    M.sleep();
    at(22, 21);
    M.st().toggleTask(id); // done on the Mac at 9 PM, but the Mac went offline before it synced
    const g0 = P.gold();
    at(23, 9);
    P.st().checkDeadlines(); // the phone, up to date as far as it knows, charges the 22nd
    await P.sync();
    expect(P.gold()).toBeLessThan(g0);
    await M.sync(); // the Mac's completion arrives later
    await P.sync();
    expect(P.st().tasks[id].doneFor).toBe('2026-10-22');
    P.st().checkDeadlines();
    await P.sync();
    await M.sync();
    expect(P.st().tasks[id].pendingMiss ?? null).toBeNull();
    expect(P.st().tasks[id].misses ?? 0).toBe(0);
    expect(P.gold()).toBeGreaterThanOrEqual(g0); // all of it back (plus the quest's own reward)
  });

  it('a stale copy plans the same notifications once it has synced: none for a quest done elsewhere', async () => {
    M.sleep();
    at(22, 21);
    P.st().toggleTask(id);
    await P.sync();
    await M.sync();
    const plan = (x: ReturnType<typeof dev>) => {
      const v = x.st();
      return alarmsFor({ hero: v.hero, lists: v.lists, tasks: v.tasks, accountId: v.accountId }, Date.now(), v.settings, DEFAULT_PUSH_PREFS).map((a) => a.key);
    };
    const key = `missed:${id}@${new Date(2026, 9, 23).getTime()}`;
    expect(plan(P)).not.toContain(key);
    expect(plan(M)).not.toContain(key);
  });
});
