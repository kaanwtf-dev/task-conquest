// End-to-end tests of the app's sync wiring (state/sync.ts + the store) against the in-memory cloud:
// auth events, app relaunches (modules reloaded, the store rehydrated from localStorage), other devices.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device as DeviceT, FakeRemote as FakeRemoteT, FakeServer as FakeServerT } from '../sync/fakeCloud';

type User = { id: string; email: string | null } | null;

// browser globals the store and sync layer touch, and the shared fake cloud (survives module reloads)
const H = vi.hoisted(() => {
  const mem = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  g.window = globalThis;
  g.location = { hash: '', pathname: '/', search: '' };
  g.history = { replaceState() {} };
  return {
    mem,
    server: null as unknown as FakeServerT,
    remotes: [] as FakeRemoteT[],
    authCbs: [] as ((u: User) => void)[],
    session: null as User,
    pullFail: 0,
    leaveFail: 0,
    leaveGate: null as Promise<void> | null,
    calls: [] as string[],
  };
});

vi.mock('../sync/supabase', async () => {
  const { FakeRemote } = await import('../sync/fakeCloud');
  const { SyncOfflineError } = await import('../sync/types');
  class MockRemote extends FakeRemote {
    constructor(_client: unknown, userId: string) {
      super(H.server, userId);
      H.remotes.push(this);
    }
    async pull(since: string | null) {
      if (H.pullFail > 0) {
        H.pullFail--;
        throw new SyncOfflineError();
      }
      return super.pull(since);
    }
  }
  return {
    getSyncConfig: () => ({ url: 'https://x.supabase.co', anonKey: 'k'.repeat(30) }),
    getClient: () => ({}),
    getUser: async () => H.session,
    onAuthChange: (cb: (u: User) => void) => {
      H.authCbs.push(cb);
      return () => void H.authCbs.splice(H.authCbs.indexOf(cb), 1);
    },
    signOut: async () => emit(null),
    SupabaseRemote: MockRemote,
  };
});

vi.mock('../sync/party', () => ({
  joinList: async (code: string) => {
    H.calls.push(`join:${code}`);
    return H.server.joinList(H.session!.id, code);
  },
  leaveList: async (listId: string) => {
    H.calls.push(`leave:${listId}`);
    if (H.leaveGate) await H.leaveGate;
    if (H.leaveFail > 0) {
      H.leaveFail--;
      throw new Error('offline');
    }
    H.server.leaveList(H.session!.id, listId);
  },
  upsertProfile: async () => undefined,
}));

function emit(u: User) {
  H.session = u;
  for (const cb of [...H.authCbs]) cb(u);
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function settle(n = 30) {
  for (let i = 0; i < n; i++) await tick(0);
}

const U = 'uuuuuuuu-0000-4000-8000-000000000001';
const Y = 'yyyyyyyy-0000-4000-8000-000000000002';
const BO = 'bbbbbbbb-0000-4000-8000-00000000000b';
const as = (id: string): User => ({ id, email: `${id.slice(0, 2)}@test` });
const APP = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' } as never;

type App = {
  store: typeof import('./store');
  sync: typeof import('./sync');
  fx: typeof import('./fx');
};
let app: App | null = null;
const devices: DeviceT[] = [];

/** Start (or restart) the app: the previous instance stops, modules reload, the store rehydrates. */
async function launch(session: User): Promise<App> {
  if (app) {
    for (const cb of [...H.authCbs]) cb(null); // the old instance's engine stops
    H.authCbs.length = 0;
    await settle(5);
  }
  vi.resetModules();
  H.session = session;
  const store = await import('./store');
  const sync = await import('./sync');
  const fx = await import('./fx');
  sync.initSync();
  await settle(40);
  app = { store, sync, fx };
  return app;
}

async function device(user: string, id: string): Promise<DeviceT> {
  const { Device } = await import('../sync/fakeCloud');
  const d = new Device(H.server, user, id, Date.now());
  devices.push(d);
  return d;
}

const st = () => app!.store.useStore.getState();
const live = <T extends { deleted?: boolean }>(r: Record<string, T>) => Object.values(r).filter((x) => !x.deleted);
const serverHero = (user: string) => H.server.rows.get(`hero:${user}`);

beforeEach(async () => {
  const { FakeServer } = await import('../sync/fakeCloud');
  H.mem.clear();
  H.server = new FakeServer();
  H.remotes.length = 0;
  H.authCbs.length = 0;
  H.calls.length = 0;
  H.session = null;
  H.pullFail = H.leaveFail = 0;
  H.leaveGate = null;
  app = null;
});

afterEach(async () => {
  for (const cb of [...H.authCbs]) cb(null);
  for (const d of devices.splice(0)) d.engine.stop();
  await settle(5);
});

/** A signed-in player U with a synced hero. */
async function signedIn(name = 'Old Hero') {
  await launch(null);
  st().createHero(name, APP, 'knight');
  await launch(as(U));
  await app!.sync.syncNow();
  expect(serverHero(U)).toBeDefined();
}

describe('Start over', () => {
  it('signed in: the cloud hero is deleted and stays deleted after a relaunch', async () => {
    await signedIn();
    st().resetAll();
    await settle();
    await app!.sync.syncNow();
    expect(serverHero(U)!.deleted).toBe(true);
    await launch(as(U)); // iOS evicted the app before a new hero was made
    expect(st().hero).toBeNull();
  });

  it('signed in: another device drops the hero too instead of bringing it back', async () => {
    await signedIn();
    const phone = await device(U, 'phone');
    await phone.engine.syncNow();
    expect(phone.snap.hero!.name).toBe('Old Hero');
    st().resetAll();
    await settle();
    await app!.sync.syncNow();
    await phone.engine.syncNow();
    expect(phone.snap.hero).toBeNull();
    await app!.sync.syncNow();
    expect(st().hero).toBeNull();
  });

  it('offline, then relaunched online: the old hero is deleted, not restored', async () => {
    await signedIn();
    for (const r of H.remotes) r.online = false;
    st().resetAll();
    await settle();
    await launch(as(U));
    await app!.sync.syncNow();
    expect(st().hero).toBeNull();
    expect(serverHero(U)!.deleted).toBe(true);
  });

  it('signed out, then signing in: the old save is not restored and its lists are deleted', async () => {
    await signedIn();
    emit(null);
    await settle();
    st().resetAll();
    emit(as(U));
    await settle(60);
    await app!.sync.syncNow();
    expect(st().hero).toBeNull();
    expect(live(st().lists)).toHaveLength(0);
    expect(serverHero(U)!.deleted).toBe(true);
    expect([...H.server.rows.values()].filter((r) => r.kind === 'list' && !r.deleted)).toHaveLength(0);
  });

  it('signed out with a new hero made since: no "Two heroes" prompt, the new hero replaces the old one', async () => {
    await signedIn();
    emit(null);
    await settle();
    st().resetAll();
    st().createHero('New Hero', APP, 'mage');
    emit(as(U));
    await settle(60);
    expect(app!.sync.useSync.getState().conflict).toBeNull();
    await app!.sync.syncNow();
    expect(st().hero!.name).toBe('New Hero');
    const row = serverHero(U)!;
    expect(row.deleted).toBe(false);
    expect((row.data as { name: string }).name).toBe('New Hero');
  });
});

describe('startup failures recover', () => {
  it('a failed cloud adoption does not leave sync dead', async () => {
    await signedIn();
    // a fresh device with no hero: the cloud save is adopted on sign-in, and that pull fails once
    H.mem.clear();
    H.pullFail = 1;
    await launch(as(U));
    expect(app!.sync.useSync.getState().status).not.toBe('syncing');
    // nothing pressed: the next auth event (token refresh, app focus) is enough to recover
    emit(as(U));
    await settle(60);
    expect(st().hero?.name).toBe('Old Hero');
    expect(app!.sync.useSync.getState().status).toBe('idle');
    // and later edits push on their own again
    st().updateHero({ name: 'Renamed' });
    await vi.waitFor(() => expect((serverHero(U)!.data as { name: string }).name).toBe('Renamed'), { timeout: 4000 });
  });
});

describe('party lists', () => {
  async function boWithLists() {
    const bo = await device(BO, 'bo');
    bo.createHero('Bo');
    bo.addList('A', 'Book club');
    bo.addList('S', 'Groceries', { type: 'supply' });
    for (const [id, title] of [['s1', 'Milk'], ['s2', 'Eggs'], ['s3', 'Bread'], ['s4', 'Rice'], ['s5', 'Tea']]) {
      bo.addTask(id, 'S', title);
      bo.editTask(id, { createdBy: 'Bo' });
    }
    await bo.engine.syncNow();
    return { bo, codeA: H.server.createInvite(BO, 'A'), codeS: H.server.createInvite(BO, 'S') };
  }

  it('a leave made offline reaches the server later, and the list is never deleted for the party', async () => {
    const { codeS } = await boWithLists();
    await signedIn('Ayla');
    await app!.sync.joinByCode(codeS);
    expect(st().lists.S.shared).toBe(true);
    H.leaveFail = 1;
    st().deleteList('S'); // on a joined list this leaves it
    await settle();
    expect(st().lists.S).toBeUndefined();
    expect(H.server.isMember('S', U)).toBe(true);
    await app!.sync.syncNow();
    await settle();
    expect(H.server.isMember('S', U)).toBe(false);
    expect(H.server.rows.get('S')!.deleted).toBe(false);
    expect(st().lists.S).toBeUndefined();
  });

  it('rejoining while a leave is being sent is not undone', async () => {
    const { codeA, codeS } = await boWithLists();
    await signedIn('Ayla');
    await app!.sync.joinByCode(codeA);
    await app!.sync.joinByCode(codeS);
    H.leaveFail = 2;
    st().leaveList('A');
    st().leaveList('S');
    await settle();
    let open!: () => void;
    H.leaveGate = new Promise<void>((r) => (open = r));
    await app!.sync.syncNow(); // the flush starts and hangs on leave(A)
    await settle(5);
    const rejoin = app!.sync.joinByCode(codeS);
    H.leaveGate = null;
    open();
    await rejoin;
    await settle();
    await app!.sync.syncNow();
    await settle();
    expect(H.server.isMember('S', U)).toBe(true);
    expect(st().lists.S).toBeDefined();
    expect(H.server.isMember('A', U)).toBe(false);
  });

  it('a list joined on another device arrives without a flood of party toasts', async () => {
    const { codeS } = await boWithLists();
    await signedIn('Ayla');
    const toasts: string[] = [];
    app!.fx.fx.on((e) => void (e.type === 'party' && toasts.push(e.text)));
    // joined on the phone: this device learns about it from a membership change
    H.server.joinList(U, codeS);
    H.server.deliver();
    await app!.sync.syncNow();
    await settle();
    expect(st().lists.S).toBeDefined();
    expect(toasts).toEqual([]);
  });

  it('the owner restoring a backup keeps what the party added since', async () => {
    await signedIn('Ayla');
    const sid = st().addList({ name: 'Family groceries', type: 'supply', theme: 'tavern', skill: 'mercantile' });
    const milk = st().addTask(sid, 'Milk')!;
    await app!.sync.syncNow();
    st().updateList(sid, { shared: true, ownerId: U });
    await app!.sync.syncNow();
    const code = H.server.createInvite(U, sid);
    const backup = st().exportData();

    const bo = await device(BO, 'bo');
    bo.createHero('Bo');
    H.server.joinList(BO, code);
    await bo.engine.syncNow();
    bo.addTask('b1', sid, 'Diapers');
    bo.complete(milk, 1);
    await bo.engine.syncNow();
    await app!.sync.syncNow();

    expect(st().importData(backup)).toBe(true);
    await app!.sync.syncNow();
    await bo.engine.syncNow();
    const open = live(bo.snap.tasks).filter((t) => t.listId === sid);
    expect(open.map((t) => t.title).sort()).toEqual(['Diapers', 'Milk']);
    expect(bo.snap.tasks[milk].doneFor).toBeTruthy();
  });

  it('an install from before the store knew its account still treats its own shared list as its own', async () => {
    await signedIn('Ayla');
    const sid = st().addList({ name: 'Chores', type: 'quests', theme: 'tavern', skill: 'hearthcraft' });
    st().updateList(sid, { shared: true, ownerId: U });
    await app!.sync.syncNow();
    // the old persisted shape: no accountId (version 3), the last user only in the sync layer's key
    const raw = JSON.parse(H.mem.get('questlog-v1')!);
    delete raw.state.accountId;
    raw.version = 3;
    H.mem.set('questlog-v1', JSON.stringify(raw));
    H.mem.set('questlog-sync-last-user', U);
    emit(null);
    await launch(null); // signed out
    expect(st().accountId).toBe(U);
    expect(app!.store.isForeignList(st().lists[sid], st().accountId)).toBe(false);
  });
});

describe('another account on this device', () => {
  it('"bring" moves own lists (shared ones as private copies) and leaves the old account untouched', async () => {
    await signedIn('Ayla');
    const sid = st().addList({ name: 'Family', type: 'quests', theme: 'tavern', skill: 'hearthcraft' });
    st().addTask(sid, 'Vacuum');
    st().updateList(sid, { shared: true, ownerId: U });
    await app!.sync.syncNow();
    const before = JSON.stringify([...H.server.rows.values()].filter((r) => r.owner === U));
    emit(null);
    await settle();
    emit(as(Y));
    await settle(60);
    expect(app!.sync.useSync.getState().conflict).toEqual({ kind: 'account' });
    await app!.sync.resolveAccountSwitch('bring');
    await app!.sync.syncNow();
    const names = live(st().lists).map((l) => l.name);
    expect(names).toContain('Family');
    const family = live(st().lists).find((l) => l.name === 'Family')!;
    expect(family.id).not.toBe(sid);
    expect(family.shared).toBeUndefined();
    expect(JSON.stringify([...H.server.rows.values()].filter((r) => r.owner === U))).toBe(before);
    expect(H.server.rows.get(family.id)!.owner).toBe(Y);
  });
});
