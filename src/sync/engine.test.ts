import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../core/types';
import { sum } from '../game/progression';
import { AuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import { fromRow, HERO_ID, remoteId, SyncEngine, toRow, tsMs } from './engine';
import { getClient, getSyncConfig, getUser, onAuthChange, RemoteError, setSyncConfig, signIn, signOut, SupabaseRemote } from './supabase';
import { canon } from './merge';
import { inviteUrl, normalizeCode, toMember } from './party';
import { SyncOfflineError } from './types';
import type { RemoteRow } from './types';

// getClient() builds its client through createClient: hand it a stub auth (no network in tests)
const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), stopAutoRefresh: vi.fn(), signOut: vi.fn() }));
vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const real = await importOriginal<typeof import('@supabase/supabase-js')>();
  const createClient = vi.fn((url: string, key: string) => {
    real.createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); // real URL validation
    return { auth, removeAllChannels: vi.fn() };
  });
  return { ...real, createClient };
});

import { Device, FakeServer, jsonb, makeHero } from './fakeCloud';

/** Every doc this device holds matches the server copy, and every live server doc it may see is held. */
function expectServerAgrees(server: FakeServer, d: Device) {
  const visible = server.view(d.user);
  const held = new Set<string>();
  const colls = [['list', d.snap.lists], ['task', d.snap.tasks], ['item', d.snap.items], ['potion', d.snap.potions]] as const;
  for (const [kind, docs] of colls) {
    for (const doc of Object.values(docs)) {
      const id = remoteId(kind, doc.id, d.user);
      held.add(id);
      const row = server.rows.get(id);
      expect(row, `${kind} ${doc.id} on server`).toBeDefined();
      expect(canon(fromRow(row!, d.user)?.doc)).toBe(canon(doc));
    }
  }
  if (d.snap.hero) {
    const id = remoteId('hero', HERO_ID, d.user);
    held.add(id);
    expect(canon(fromRow(server.rows.get(id)!, d.user)?.doc)).toBe(canon(d.snap.hero));
  }
  for (const r of visible) if (!r.deleted) expect(held.has(r.id), `server doc ${r.id} reached the device`).toBe(true);
}

const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const B = 'bbbbbbbb-0000-4000-8000-00000000000b';

/** User A with a hero, two lists and some tasks, synced from device "mac". */
async function seededMac(server: FakeServer) {
  const mac = new Device(server, A, 'mac');
  mac.createHero('Ayla');
  mac.addList('L-daily', 'Daily');
  mac.addList('L-home', 'Home');
  mac.addTask('t1', 'L-daily', 'Workout');
  mac.addTask('t2', 'L-daily', 'Read');
  mac.addTask('t3', 'L-home', 'Laundry');
  mac.addTask('t4', 'L-home', 'Dishes');
  mac.addItem('starter-knight-weapon', 'Rusty Sword');
  mac.addPotion('insight', 1, 2);
  await mac.engine.syncNow();
  return mac;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------- tests

describe('doc mapping', () => {
  it('namespaces personal docs per user and round-trips every kind', () => {
    const d = new Device(new FakeServer(), A, 'mac');
    d.createHero('Ayla');
    d.addList('L1', 'Home');
    d.addTask('T1', 'L1', 'Dishes');
    d.addItem('starter-knight-weapon', 'Sword');
    d.addPotion('fortune', 2, 1);
    const cases = [
      ['hero', d.snap.hero!, `hero:${A}`, null],
      ['list', d.snap.lists.L1, 'L1', 'L1'],
      ['task', d.snap.tasks.T1, 'T1', 'L1'],
      ['item', d.snap.items['starter-knight-weapon'], `item:${A}:starter-knight-weapon`, null],
      ['potion', d.snap.potions['fortune:2'], `potion:${A}:fortune:2`, null],
    ] as const;
    for (const [kind, doc, id, listId] of cases) {
      const row = toRow(kind, doc, A);
      expect(row.id).toBe(id);
      expect(row.list_id).toBe(listId);
      expect(canon(fromRow(jsonb(row), A)?.doc)).toBe(canon(doc));
    }
  });

  it('ignores other users’ personal rows and malformed data', () => {
    const hero = toRow('hero', makeHero('Bo', 1), B);
    expect(fromRow(hero, A)).toBeNull();
    expect(fromRow({ ...hero, id: `hero:${A}`, data: { name: 'x' } }, A)).toBeNull();
    expect(fromRow({ id: 'T', kind: 'task', list_id: 'L', data: { title: 5 } as never, updated_at: 1, deleted: false }, A)).toBeNull();
    expect(fromRow({ id: 'X', kind: 'bogus' as never, list_id: null, data: {}, updated_at: 1, deleted: false }, A)).toBeNull();
  });

  it('takes list ownership from the server owner column, not the doc', () => {
    const row = { id: 'L9', kind: 'list' as const, list_id: 'L9', data: { name: 'Groceries', type: 'supply', theme: 'tavern', skill: 'mercantile', order: 0, shared: false }, updated_at: 5, deleted: false };
    // someone else's list we can read is shared with us, even if a stale edit cleared the flags
    expect(fromRow({ ...row, owner: B }, A)!.doc).toMatchObject({ ownerId: B, shared: true });
    // our own list keeps whatever sharing state it has, and a forged owner field is corrected
    expect(fromRow({ ...row, owner: A }, A)!.doc).toMatchObject({ shared: false });
    expect(fromRow({ ...row, data: { ...row.data, ownerId: B }, owner: A }, A)!.doc).toMatchObject({ ownerId: A });
  });

  it('parses Postgres and realtime timestamp formats', () => {
    const ms = Date.UTC(2026, 9, 13, 12, 34, 56, 123);
    expect(tsMs('2026-10-13T12:34:56.123456+00:00')).toBe(ms);
    expect(tsMs('2026-10-13 12:34:56.123456+00')).toBe(ms);
    expect(tsMs('2026-10-13T14:34:56.123+02:00')).toBe(ms);
    expect(tsMs('2026-10-13T12:34:56.123Z')).toBe(ms);
    expect(tsMs('2026-10-13 12:34:56+0000')).toBe(ms - 123);
  });
});

describe('two devices, one user', () => {
  it('a fresh device receives everything', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const phone = new Device(server, A, 'phone', 5_000_000);
    await phone.engine.syncNow();
    expect(phone.live()).toBe(mac.live());
    expect(phone.snap.potions['insight:1'].count).toBe(2);
    expectServerAgrees(server, mac);
    expectServerAgrees(server, phone);
  });

  it('converges after concurrent offline edits; deletes propagate; hero progress adds up', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const phone = new Device(server, A, 'phone', 1_000_100);
    await phone.engine.syncNow();
    const xpBefore = sum(mac.snap.hero!.xp);

    mac.online = false;
    phone.online = false;
    mac.editTask('t1', { title: 'Workout (mac)' });
    mac.complete('t2', 50);
    mac.addTask('t5', 'L-home', 'Water plants');
    mac.addItem('i-mac', 'Mac Blade');
    phone.clock = mac.clock + 1000; // the phone edits t1 later than the mac did
    phone.editTask('t1', { title: 'Workout (phone)' });
    phone.complete('t3', 30);
    phone.deleteTask('t4');
    phone.addPotion('insight', 1, 5);

    await mac.engine.syncNow();
    expect(mac.engine.status).toBe('offline');
    expect(mac.statuses).toContain('offline');

    mac.online = true;
    phone.online = true;
    await mac.engine.syncNow();
    await phone.engine.syncNow();
    await mac.engine.syncNow();

    expect(phone.live()).toBe(mac.live());
    for (const d of [mac, phone]) {
      expect(d.snap.tasks.t1.title).toBe('Workout (phone)');
      expect(d.snap.tasks.t4.deleted).toBe(true);
      expect(d.snap.tasks.t5.title).toBe('Water plants');
      expect(d.snap.items['i-mac'].name).toBe('Mac Blade');
      expect(d.snap.potions['insight:1'].count).toBe(5);
      expect(sum(d.snap.hero!.xp)).toBe(xpBefore + 80);
      expect(d.snap.hero!.xp).toEqual({ mac: 50, phone: 30 });
      expect(sum(d.snap.hero!.tasksDone)).toBe(2);
      expectServerAgrees(server, d);
      expect(d.engine.status).toBe('idle');
    }
  });

  it('keeps both devices’ progress when their hero pushes race', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const phone = new Device(server, A, 'phone', 9_000_000); // clock far ahead
    await phone.engine.syncNow();
    for (let i = 0; i < 5; i++) {
      mac.complete('t1', 10);
      phone.complete('t2', 7);
      // alternate who syncs first; the server keeps whichever hero is stamped newer
      await (i % 2 ? mac : phone).engine.syncNow();
      await (i % 2 ? phone : mac).engine.syncNow();
    }
    await mac.engine.syncNow();
    await phone.engine.syncNow();
    expect(mac.snap.hero!.xp).toEqual({ mac: 50, phone: 35 });
    expect(phone.live()).toBe(mac.live());
    expectServerAgrees(server, mac);
  });

  it('pushes an edit made on a clock that lags the synced version', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const phone = new Device(server, A, 'phone', 9_000_000);
    await phone.engine.syncNow();
    phone.editTask('t1', { title: 'from the future' });
    await phone.engine.syncNow();
    await mac.engine.syncNow();
    expect(mac.snap.tasks.t1.title).toBe('from the future');
    mac.editTask('t1', { title: 'mac, clock behind' }); // stamped well before the phone's version
    await mac.engine.syncNow();
    await phone.engine.syncNow();
    expect(phone.snap.tasks.t1.title).toBe('mac, clock behind');
    expect(phone.live()).toBe(mac.live());
  });

  it('settles equal timestamps with different content the same way everywhere', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const phone = new Device(server, A, 'phone');
    await phone.engine.syncNow();
    const at = mac.clock + 500;
    mac.editTask('t2', { title: 'Read (mac)' }, at);
    phone.editTask('t2', { title: 'Read (phone)' }, at);
    await mac.engine.syncNow();
    await phone.engine.syncNow();
    await mac.engine.syncNow();
    await phone.engine.syncNow();
    expect(mac.snap.tasks.t2.title).toBe(phone.snap.tasks.t2.title);
    expect(fromRow(server.rows.get('t2')!, A)!.doc).toMatchObject({ title: mac.snap.tasks.t2.title });
  });

  it('writes to the store only when something changed and pushes only dirty docs', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const writes = mac.writes;
    const pushes = mac.remote.pushCalls;
    await mac.engine.syncNow();
    await mac.engine.syncNow();
    expect(mac.writes).toBe(writes);
    expect(mac.remote.pushCalls).toBe(pushes);
    mac.editTask('t3', { title: 'Laundry!' });
    mac.remote.pushedIds = [];
    await mac.engine.syncNow();
    expect(mac.remote.pushedIds).toEqual(['t3']);
  });

  it('survives a restart: the persisted cursor and push map stay valid', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const pushes = mac.remote.pushCalls;
    const again = new SyncEngine(
      { deviceId: 'mac', read: () => mac.snap, write: (p) => void (mac.snap = { ...mac.snap, ...p }) },
      mac.remote,
      { get: (k) => mac.kv.get(k) ?? null, set: (k, v) => void mac.kv.set(k, v) },
      A,
      { intervalMs: 0 },
    );
    await again.syncNow();
    expect(mac.remote.pushCalls).toBe(pushes);
  });
});

describe('party lists', () => {
  async function party() {
    const server = new FakeServer();
    const mac = await seededMac(server);
    mac.addList('S', 'Groceries', { shared: true, ownerId: A });
    mac.addTask('s1', 'S', 'Milk');
    mac.addTask('s2', 'S', 'Eggs');
    await mac.engine.syncNow();
    const phone = new Device(server, A, 'phone');
    await phone.engine.syncNow();
    const bo = new Device(server, B, 'bo-phone', 3_000_000);
    bo.createHero('Bo');
    bo.addItem('starter-knight-weapon', 'Bo Sword'); // same local id as Ayla's starter item
    await bo.engine.syncNow();
    const code = server.createInvite(A, 'S');
    const listId = server.joinList(B, code);
    await bo.engine.pullList(listId);
    return { server, mac, phone, bo };
  }

  it('a friend sees only the shared list, never the owner’s other data', async () => {
    const { server, bo } = await party();
    expect(Object.keys(bo.snap.lists)).toEqual(['S']);
    expect(bo.liveTasks()).toEqual(['s1', 's2']);
    expect(bo.snap.hero!.name).toBe('Bo');
    expect(bo.snap.items['starter-knight-weapon'].name).toBe('Bo Sword');
    expect(Object.keys(bo.snap.potions)).toEqual([]);
    const seen = await bo.remote.pull(null);
    expect(seen.every((r) => r.list_id === 'S' || r.owner === B)).toBe(true);
    expect(server.view(B).some((r) => r.list_id === 'L-home')).toBe(false);
    await bo.engine.syncNow();
    expectServerAgrees(server, bo);
  });

  it('edits flow both ways; each hero keeps its own progress', async () => {
    const { server, mac, phone, bo } = await party();
    const ayla = sum(mac.snap.hero!.xp);
    bo.complete('s1', 40);
    bo.addTask('s3', 'S', 'Bread');
    await bo.engine.syncNow();
    mac.deleteTask('s2');
    await mac.engine.syncNow();
    await phone.engine.syncNow();
    await bo.engine.syncNow();

    for (const d of [mac, phone, bo]) {
      expect(d.snap.tasks.s1).toMatchObject({ doneFor: 'once', doneBy: 'Bo' });
      expect(d.snap.tasks.s3.title).toBe('Bread');
      expect(d.snap.tasks.s2.deleted).toBe(true);
      expectServerAgrees(server, d);
    }
    expect(sum(bo.snap.hero!.xp)).toBe(40);
    expect(sum(mac.snap.hero!.xp)).toBe(ayla);
    expect(mac.snap.hero!.name).toBe('Ayla');
    expect(server.rows.get('S')!.owner).toBe(A);
    expect(server.rows.get('s3')!.owner).toBe(B);
  });

  it('a list joined on one device shows up on the user’s other device; leaving removes it everywhere', async () => {
    const { server, bo } = await party();
    const tablet = new Device(server, B, 'bo-tablet');
    await tablet.engine.syncNow();
    expect(tablet.liveTasks()).toEqual(['s1', 's2']);

    // a second list joined later, after the tablet's cursor moved past its docs
    const mac2 = new Device(server, A, 'mac');
    mac2.snap = { ...mac2.snap, lists: {}, tasks: {} };
    const owner = await seededMac(server);
    owner.addList('S2', 'Chores', { shared: true });
    owner.addTask('c1', 'S2', 'Vacuum');
    await owner.engine.syncNow();
    for (let i = 0; i < 10; i++) {
      owner.addTask(`n${i}`, 'L-home', 'noise'); // push the server clock well past the overlap window
      await owner.engine.syncNow();
    }
    await tablet.engine.syncNow();
    const listId = server.joinList(B, server.createInvite(A, 'S2'));
    await bo.engine.pullList(listId);
    expect(bo.snap.tasks.c1.title).toBe('Vacuum');
    await tablet.engine.syncNow();
    expect(tablet.snap.tasks.c1.title).toBe('Vacuum');

    server.leaveList(B, 'S');
    bo.engine.purgeList('S');
    expect(bo.snap.lists.S).toBeUndefined();
    expect(Object.values(bo.snap.tasks).some((t) => t.listId === 'S')).toBe(false);
    await tablet.engine.syncNow();
    expect(tablet.snap.lists.S).toBeUndefined();
    expect(tablet.snap.lists.S2).toBeDefined();
    // leaving never deletes the list for the others
    expect(server.rows.get('S')!.deleted).toBe(false);
    await bo.engine.syncNow();
    expect(bo.snap.lists.S).toBeUndefined();
  });

  it('a stale copy from before the list was shared never un-shares it', async () => {
    const { server, mac, phone } = await party();
    // the owner's phone went offline before sharing reached it, then renamed the list
    phone.online = false;
    const stale = { ...phone.snap.lists.S, shared: false, ownerId: undefined, name: 'Groceries!', updatedAt: phone.now() + 1_000_000 };
    phone.snap = { ...phone.snap, lists: { ...phone.snap.lists, S: stale } };
    phone.online = true;
    await phone.engine.syncNow();
    await mac.engine.syncNow();
    expect(mac.snap.lists.S).toMatchObject({ name: 'Groceries!', shared: true, ownerId: A });
    await vi.waitFor(async () => {
      await mac.engine.syncNow();
      expect(fromRow(server.rows.get('S')!, A)!.doc).toMatchObject({ name: 'Groceries!', shared: true });
    });
    await phone.engine.syncNow();
    expect(phone.snap.lists.S).toMatchObject({ name: 'Groceries!', shared: true, ownerId: A });
  });

  it('a list left while offline stays gone until the server hears about it', async () => {
    const { server, mac, bo } = await party();
    bo.engine.purgeList('S', true); // the leave hasn't reached the server: membership still lists S
    await bo.engine.syncNow();
    expect(bo.snap.lists.S).toBeUndefined();
    mac.addTask('s3', 'S', 'Bread'); // the party keeps editing
    await mac.engine.syncNow();
    await bo.engine.syncNow();
    expect(bo.snap.lists.S).toBeUndefined();
    expect(bo.snap.tasks.s3).toBeUndefined();
    server.leaveList(B, 'S');
    bo.engine.leaveConfirmed('S');
    await bo.engine.syncNow();
    expect(bo.snap.lists.S).toBeUndefined();
    expect(server.rows.get('S')!.deleted).toBe(false); // left, never deleted for the party
  });

  it('refused rows are reported and not retried every cycle', async () => {
    const { bo } = await party();
    bo.addList('L-home', 'Hijack'); // id already taken by Ayla's private list
    await bo.engine.syncNow();
    expect(bo.engine.lastRejected).toEqual(['L-home']);
    bo.remote.pushedIds = [];
    await bo.engine.syncNow();
    expect(bo.remote.pushedIds).toEqual([]);
    expect(bo.engine.status).toBe('idle');
  });
});

describe('realtime and scheduling', () => {
  it('applies live changes without polling and merges heroes that arrive live', async () => {
    vi.useFakeTimers();
    const server = new FakeServer();
    const mac = await seededMac(server);
    const phone = new Device(server, A, 'phone');
    await phone.engine.syncNow();
    await mac.engine.start();
    await phone.engine.start();

    phone.editTask('t1', { title: 'live edit' });
    phone.complete('t2', 25);
    phone.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(150);
    server.deliver();
    expect(mac.snap.tasks.t1.title).toBe('live edit');
    expect(mac.snap.hero!.xp.phone).toBe(25);

    // mac earns XP while the phone's version is live: the merged hero goes back up by itself
    mac.complete('t3', 5);
    mac.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(150);
    server.deliver();
    await vi.advanceTimersByTimeAsync(150);
    server.deliver();
    expect(phone.snap.hero!.xp).toEqual({ phone: 25, mac: 5 });
    expect(phone.live()).toBe(mac.live());
    mac.engine.stop();
    phone.engine.stop();
  });

  it('debounces pushes after local edits', async () => {
    vi.useFakeTimers();
    const server = new FakeServer();
    const mac = await seededMac(server);
    const calls = mac.remote.pushCalls;
    for (let i = 0; i < 5; i++) {
      mac.editTask('t1', { title: `edit ${i}` });
      mac.engine.notifyLocalChange();
      await vi.advanceTimersByTimeAsync(40);
    }
    expect(mac.remote.pushCalls).toBe(calls);
    await vi.advanceTimersByTimeAsync(200);
    expect(mac.remote.pushCalls).toBe(calls + 1);
    expect(fromRow(server.rows.get('t1')!, A)!.doc).toMatchObject({ title: 'edit 4' });
    mac.engine.stop();
  });

  it('reports errors and recovers', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const pull = mac.remote.pull.bind(mac.remote);
    mac.remote.pull = async () => {
      throw new Error('500 from server');
    };
    await mac.engine.syncNow();
    expect(mac.engine.status).toBe('error');
    mac.remote.pull = pull;
    await mac.engine.syncNow();
    expect(mac.engine.status).toBe('idle');
    expect(mac.statuses.slice(-3)).toEqual(['error', 'syncing', 'idle']);
  });

  it('coalesces overlapping sync requests', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    let pulls = 0;
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const pull = mac.remote.pull.bind(mac.remote);
    mac.remote.pull = async (s) => {
      if (++pulls === 1) await gate;
      return pull(s);
    };
    // requested together: one cycle
    const first = mac.engine.syncNow();
    const same = mac.engine.syncNow();
    await vi.waitFor(() => expect(pulls).toBe(1));
    // requested while that cycle runs: exactly one follow-up cycle
    const later = [mac.engine.syncNow(), mac.engine.syncNow(), mac.engine.syncNow()];
    release();
    await Promise.all([first, same, ...later]);
    expect(pulls).toBe(2);
  });
});

describe('first sign-in on a device that already has a hero', () => {
  async function withNewcomer() {
    const server = new FakeServer();
    const mac = await seededMac(server);
    mac.addList('S', 'Groceries', { shared: true });
    mac.addTask('s1', 'S', 'Milk');
    mac.complete('t1', 100);
    await mac.engine.syncNow();
    const ipad = new Device(server, A, 'ipad', 7_000_000);
    ipad.createHero('Ivo');
    ipad.addList('L-ipad', 'iPad list');
    ipad.addTask('i1', 'L-ipad', 'Sketch');
    ipad.addItem('ipad-sword', 'iPad Sword');
    ipad.complete('i1', 60);
    return { server, mac, ipad };
  }

  it('inspectRemoteHero shows the cloud hero', async () => {
    const { ipad } = await withNewcomer();
    expect((await ipad.engine.inspectRemoteHero())?.name).toBe('Ayla');
    const empty = new Device(new FakeServer(), B, 'x');
    expect(await empty.engine.inspectRemoteHero()).toBeNull();
  });

  it('cloud: this device becomes a copy of the cloud', async () => {
    const { server, mac, ipad } = await withNewcomer();
    await ipad.engine.adoptStrategy('cloud');
    expect(ipad.live()).toBe(mac.live());
    expect(server.rows.has('L-ipad')).toBe(false);
    await ipad.engine.syncNow();
    expect(ipad.live()).toBe(mac.live());
    expectServerAgrees(server, ipad);
  });

  it('merge: both saves’ lists and progress are kept', async () => {
    const { server, mac, ipad } = await withNewcomer();
    await ipad.engine.adoptStrategy('merge');
    await mac.engine.syncNow();
    expect(ipad.live()).toBe(mac.live());
    // the iPad save's counters move under keys of their own, so they add to the cloud's
    expect(mac.snap.hero!.xp).toEqual({ mac: 100, 'ipad~7000007': 60 });
    expect(mac.snap.lists['L-ipad'].name).toBe('iPad list');
    expect(mac.snap.items['ipad-sword']).toBeDefined();
    expect(ipad.snap.lists['L-daily']).toBeDefined();
    expectServerAgrees(server, mac);
  });

  it('merge adds up two saves played on the same device', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    mac.complete('t1', 100); // the cloud hero's progress, made on this very device id
    await mac.engine.syncNow();
    // same device id, a second hero (Start over while signed out, then a new hero)
    const again = new Device(server, A, 'mac', 9_000_000);
    again.createHero('Second');
    again.addList('L2', 'Second list');
    again.addTask('x1', 'L2', 'Quest');
    again.complete('x1', 40);
    await again.engine.adoptStrategy('merge');
    expect(sum(again.snap.hero!.xp)).toBe(140);
    expect(sum(again.snap.hero!.tasksDone)).toBe(2);
    await mac.engine.syncNow();
    expect(sum(mac.snap.hero!.xp)).toBe(140);
  });

  it('local: this device overwrites the cloud; shared lists survive', async () => {
    const { server, mac, ipad } = await withNewcomer();
    await ipad.engine.adoptStrategy('local');
    // the mac was offline and kept playing the old hero, on a clock far ahead; the newer lineage still wins
    mac.clock = 50_000_000;
    mac.complete('t2', 1);
    await mac.engine.syncNow();
    await ipad.engine.syncNow();
    expect(mac.snap.hero!.name).toBe('Ivo');
    expect(mac.snap.hero!.xp).toEqual({ ipad: 60 });
    expect(ipad.live()).toBe(mac.live());
    const lists = Object.values(mac.snap.lists).filter((l) => !l.deleted).map((l) => l.id).sort();
    expect(lists).toEqual(['L-ipad', 'S']);
    expect(mac.snap.items['starter-knight-weapon'].deleted).toBe(true);
    expect(mac.snap.potions['insight:1'].deleted).toBe(true);
    expect(server.rows.get('L-home')!.deleted).toBe(true);
    expect(server.rows.get('t3')!.deleted).toBe(true);
    expect(server.rows.get('S')!.deleted).toBe(false);
    expectServerAgrees(server, ipad);
  });
});

describe('start over deletes the hero everywhere', () => {
  it('the cloud hero is tombstoned, other devices drop it, and old copies never come back', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const phone = new Device(server, A, 'phone');
    await phone.engine.syncNow();
    const born = mac.snap.hero!.createdAt;
    mac.snap = { ...mac.snap, hero: null }; // the store's resetAll
    mac.engine.deleteHero(born);
    await vi.waitFor(() => expect(server.rows.get(`hero:${A}`)!.deleted).toBe(true));
    await phone.engine.syncNow();
    expect(phone.snap.hero).toBeNull();
    await mac.engine.syncNow();
    expect(mac.snap.hero).toBeNull();
    // a new hero later replaces the tombstone everywhere
    mac.createHero('Nova');
    await mac.engine.syncNow();
    await phone.engine.syncNow();
    expect(phone.snap.hero!.name).toBe('Nova');
  });

  it('offline, the deleted hero is never pulled back, and it is deleted once the cloud is reachable', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const phone = new Device(server, A, 'phone');
    await phone.engine.syncNow();
    const born = mac.snap.hero!.createdAt;
    mac.online = false;
    mac.snap = { ...mac.snap, hero: null };
    mac.engine.deleteHero(born);
    phone.editHero(() => ({ title: 'the Brave' })); // the other device keeps playing it meanwhile
    await phone.engine.syncNow();
    mac.online = true;
    await mac.engine.syncNow();
    expect(mac.snap.hero).toBeNull();
    expect(server.rows.get(`hero:${A}`)!.deleted).toBe(true);
    await phone.engine.syncNow();
    expect(phone.snap.hero).toBeNull();
  });

  it('a newer hero made elsewhere is not deleted', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const born = mac.snap.hero!.createdAt;
    const phone = new Device(server, A, 'phone', 5_000_000);
    await phone.engine.syncNow();
    phone.createHero('Other'); // a newer lineage replaces the old one in the cloud first
    await phone.engine.adoptStrategy('local');
    mac.online = false;
    mac.snap = { ...mac.snap, hero: null };
    mac.engine.deleteHero(born);
    mac.online = true;
    await mac.engine.syncNow();
    expect(server.rows.get(`hero:${A}`)!.deleted).toBe(false);
    expect(mac.snap.hero!.name).toBe('Other');
  });
});

describe('review: hostile rows, lineage first contact, start over, leave races', () => {
  async function party() {
    const server = new FakeServer();
    const mac = await seededMac(server);
    mac.addList('S', 'Groceries', { shared: true, ownerId: A });
    mac.addTask('s1', 'S', 'Milk');
    await mac.engine.syncNow();
    const bo = new Device(server, B, 'bo-phone', 3_000_000);
    bo.createHero('Bo');
    await bo.engine.syncNow();
    const code = server.createInvite(A, 'S');
    await bo.engine.pullList(server.joinList(B, code));
    return { server, mac, bo, code };
  }

  it('a task filed under a shared list cannot be planted into a private list', async () => {
    const { mac, bo } = await party();
    const planted = { id: 'evil', listId: 'L-home', title: 'pwned', difficulty: 2, repeat: { kind: 'none' }, order: 0, createdAt: 1, timesDone: 0 };
    const res = await bo.remote.push([{ id: 'evil', kind: 'task', list_id: 'S', data: planted, updated_at: 5_000_000, deleted: false }]);
    expect(res.rejected).toEqual([]); // the server only sees a task in S, which Bo may write
    await mac.engine.syncNow();
    expect(mac.snap.tasks.evil).toBeUndefined();
    expect(fromRow({ id: 'evil', kind: 'task', list_id: 'S', data: planted, updated_at: 1, deleted: false }, A)).toBeNull();
  });

  it('rows the UI cannot render (unknown type/theme/skill/difficulty/repeat) are not applied', async () => {
    const { mac, bo } = await party();
    const list = mac.snap.lists.S;
    const task = mac.snap.tasks.s1;
    const bad: [string, Record<string, unknown>][] = [
      ['type', { ...list, type: 'raid' }],
      ['theme', { ...list, theme: 'moon' }],
      ['skill', { ...list, skill: '__proto__' }],
      ['difficulty', { ...task, difficulty: 9 }],
      ['difficulty', { ...task, difficulty: '2' }],
      ['repeat', { ...task, repeat: { kind: 'hourly' } }],
      ['repeat', { ...task, repeat: { kind: 'days', days: 'Mon' } }],
      ['repeat', { ...task, repeat: null }],
    ];
    let at = 6_000_000;
    for (const [field, data] of bad) {
      const kind = 'listId' in data ? 'task' : 'list';
      const row: RemoteRow = { id: String(data.id), kind, list_id: 'S', data, updated_at: ++at, deleted: false };
      expect(fromRow(row, A), field).toBeNull();
      await bo.remote.push([row]);
    }
    await mac.engine.syncNow();
    expect(mac.snap.lists.S).toEqual(list);
    expect(mac.snap.tasks.s1).toEqual(task);
    // well-formed edits still flow
    await bo.remote.push([toRow('task', { ...task, repeat: { kind: 'days', days: [1, 3] }, difficulty: 4, updatedAt: ++at } as Task, B)]);
    await mac.engine.syncNow();
    expect(mac.snap.tasks.s1).toMatchObject({ difficulty: 4, repeat: { kind: 'days', days: [1, 3] } });
  });

  it('nobody can squat another player’s personal ids (schema own_doc_id)', async () => {
    const { server, mac, bo } = await party();
    const squat = (id: string, kind: RemoteRow['kind'], list_id: string | null) =>
      bo.remote.push([{ id, kind, list_id, data: { name: 'x', listId: list_id, title: 'x' }, updated_at: 1, deleted: false }]);
    expect((await squat(`hero:${A}-x`, 'item', null)).rejected).toHaveLength(1);
    expect((await squat(`item:${A}:new-sword`, 'potion', null)).rejected).toHaveLength(1);
    expect((await squat(`potion:${A}:fury:1`, 'task', 'S')).rejected).toHaveLength(1);
    expect((await squat(`item:${B}:fine`, 'item', null)).rejected).toEqual([]);
    mac.addItem('new-sword', 'Fresh Sword');
    await mac.engine.syncNow();
    expect(mac.engine.lastRejected).toEqual([]);
    expect(server.rows.get(`item:${A}:new-sword`)!.owner).toBe(A);
  });

  it('first contact with a different hero (choice skipped, e.g. offline) merges instead of erasing a save', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    mac.complete('t1', 100);
    await mac.engine.syncNow();
    const ipad = new Device(server, A, 'ipad', 7_000_000); // newer hero: the old rule let it replace Ayla everywhere
    ipad.createHero('Ivo');
    ipad.addList('L-ipad', 'iPad list');
    ipad.addTask('i1', 'L-ipad', 'Sketch');
    ipad.complete('i1', 60);
    await ipad.engine.syncNow();
    await mac.engine.syncNow();
    for (const d of [mac, ipad]) {
      expect(d.snap.hero!.name).toBe('Ayla'); // the established cloud identity is kept
      expect(d.snap.hero!.xp).toEqual({ mac: 100, 'ipad~7000007': 60 });
      expect(d.snap.lists['L-ipad']).toBeDefined();
      expectServerAgrees(server, d);
    }
    expect(ipad.live()).toBe(mac.live());
    // later re-creations on a device that has synced still start a new lineage everywhere
    ipad.createHero('Ivo II');
    await ipad.engine.syncNow();
    await mac.engine.syncNow();
    expect(mac.snap.hero!.name).toBe('Ivo II');
    expect(mac.snap.hero!.xp).toEqual({});
  });

  it('start over: an echo of the old hero does not resurrect it; the new hero replaces it everywhere', async () => {
    const server = new FakeServer();
    const mac = await seededMac(server);
    const phone = new Device(server, A, 'phone', 2_000_000);
    await phone.engine.syncNow();
    mac.complete('t1', 10);
    await mac.engine.syncNow();
    // like store.resetAll(): drop the hero, tombstone everything else
    const t = mac.now();
    const kill = <T extends { updatedAt: number }>(r: Record<string, T>) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v, deleted: true, updatedAt: t }]));
    mac.snap = { hero: null, lists: kill(mac.snap.lists), tasks: kill(mac.snap.tasks), items: kill(mac.snap.items), potions: kill(mac.snap.potions) };
    const pulled: RemoteRow[] = [];
    const pull = mac.remote.pull.bind(mac.remote);
    mac.remote.pull = async (since) => {
      const rows = await pull(since);
      pulled.push(...rows);
      return rows;
    };
    await mac.engine.syncNow();
    expect(pulled.some((r) => r.kind === 'hero')).toBe(true); // the old hero did come back in the overlap window
    expect(mac.snap.hero).toBeNull();
    mac.createHero('Neo');
    await mac.engine.syncNow();
    await phone.engine.syncNow();
    expect(phone.snap.hero!.name).toBe('Neo');
    expect(Object.values(phone.snap.lists).every((l) => l.deleted)).toBe(true);
    expect(phone.live()).toBe(mac.live());
  });

  it('a pull that was in flight while leaving a list does not bring the list back', async () => {
    const { server, bo, code } = await party();
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let started = false;
    const pull = bo.remote.pull.bind(bo.remote);
    bo.remote.pull = async (since) => {
      const rows = await pull(since); // answered before the leave...
      started = true;
      await gate; // ...delivered after it
      return rows;
    };
    bo.addTask('s9', 'S', 'pending edit'); // keeps S's rows in the stale page
    await bo.remote.push([toRow('task', bo.snap.tasks.s9, B)]);
    const sync = bo.engine.syncNow();
    await vi.waitFor(() => expect(started).toBe(true));
    server.leaveList(B, 'S');
    bo.engine.purgeList('S');
    release();
    await sync;
    bo.remote.pull = pull;
    expect(bo.snap.lists.S).toBeUndefined();
    expect(Object.values(bo.snap.tasks).filter((t) => t.listId === 'S')).toEqual([]);
    await bo.engine.syncNow();
    expect(bo.snap.lists.S).toBeUndefined();
    // rejoining brings it back
    await bo.engine.pullList(server.joinList(B, code));
    expect(bo.snap.lists.S.name).toBe('Groceries');
    expect(bo.liveTasks()).toContain('s1');
  });

  it('a list left on another device is purged here even if the leave raced this device’s pull', async () => {
    const { server, bo } = await party();
    const tablet = new Device(server, B, 'bo-tablet');
    await tablet.engine.syncNow();
    expect(tablet.snap.lists.S).toBeDefined();
    server.leaveList(B, 'S');
    bo.engine.purgeList('S');
    await tablet.engine.syncNow();
    expect(tablet.snap.lists.S).toBeUndefined();
    expect(tablet.liveTasks()).toEqual([]);
  });
});

// ---------------------------------------------------------------- SupabaseRemote against a mock PostgREST client

type Row = Record<string, unknown>;

interface MockOpts {
  session?: boolean;
  sessionError?: unknown;
  upsert?: (body: Row[]) => { error: { message: string; code?: string } | null; status: number };
}

function mockClient(table: Row[], opts: MockOpts = {}) {
  const log: string[] = [];
  const channels: { name: string; listeners: { filter: Record<string, string>; cb: (p: unknown) => void }[]; status?: (s: string) => void; removed: boolean }[] = [];
  const cmp = (col: string, a: unknown, b: unknown) =>
    col === 'server_ts' ? tsMs(String(a)) - tsMs(String(b)) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  class Query implements PromiseLike<unknown> {
    private filters: ((r: Row) => boolean)[] = [];
    private orders: string[] = [];
    private from = 0;
    private count = Infinity;
    private single = false;
    private body: Row[] | null = null;
    constructor(private readonly name: string) {}
    select() {
      return this;
    }
    gte(c: string, v: unknown) {
      this.filters.push((r) => cmp(c, r[c], v) >= 0);
      return this;
    }
    gt(c: string, v: unknown) {
      this.filters.push((r) => cmp(c, r[c], v) > 0);
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push((r) => cmp(c, r[c], v) === 0);
      return this;
    }
    order(c: string) {
      this.orders.push(c);
      return this;
    }
    limit(n: number) {
      this.count = n;
      return this;
    }
    range(a: number, b: number) {
      this.from = a;
      this.count = b - a + 1;
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    upsert(body: Row[]) {
      this.body = body;
      return this;
    }
    then<A, B>(ok?: ((v: unknown) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve(this.run()).then(ok, bad);
    }
    private run() {
      if (this.body) {
        log.push(`upsert ${this.body.map((r) => r.id).join(',')}`);
        for (const r of this.body) expect(Object.keys(r).sort()).toEqual(['data', 'deleted', 'id', 'kind', 'list_id', 'updated_at']);
        return { data: null, ...(opts.upsert?.(this.body) ?? { error: null, status: 201 }) };
      }
      log.push(`select ${this.name}`);
      let rows = table.filter((r) => this.filters.every((f) => f(r)));
      rows = [...rows].sort((a, b) => {
        for (const c of this.orders) {
          const d = cmp(c, a[c], b[c]);
          if (d) return d;
        }
        return 0;
      });
      rows = rows.slice(this.from, this.from + this.count);
      return { data: this.single ? rows[0] ?? null : rows, error: null, status: 200 };
    }
  }
  const client = {
    from: (name: string) => new Query(name),
    auth: {
      getSession: async () => ({ data: { session: opts.session === false ? null : { user: { id: A } } }, error: opts.sessionError ?? null }),
    },
    channel(name: string) {
      const ch = { name, listeners: [] as (typeof channels)[number]['listeners'], status: undefined as ((s: string) => void) | undefined, removed: false };
      channels.push(ch);
      const api = {
        on: (_type: string, filter: Record<string, string>, cb: (p: unknown) => void) => (ch.listeners.push({ filter, cb }), api),
        subscribe: (cb: (s: string) => void) => ((ch.status = cb), api),
      };
      return api;
    },
    removeChannel: async (api: unknown) => {
      void api;
      channels[channels.length - 1].removed = true;
    },
  };
  return { client: client as unknown as SupabaseClient, log, channels };
}

const pgTs = (sec: number, micros = 0) =>
  new Date(Date.UTC(2026, 0, 1) + sec * 1000).toISOString().replace('.000Z', `.${String(micros).padStart(6, '0')}+00:00`);

const docRow = (i: number, ts: string): Row => ({
  id: `t${String(i).padStart(5, '0')}`, kind: 'task', list_id: 'L', data: { listId: 'L', title: `#${i}` }, updated_at: i, deleted: false, owner: A, server_ts: ts,
});

describe('SupabaseRemote', () => {
  it('pages through every row once, oldest first, starting 5s before the cursor', async () => {
    const table = Array.from({ length: 2500 }, (_, i) => docRow(i, pgTs(i, 7)));
    const { client, log } = mockClient(table);
    const remote = new SupabaseRemote(client, A);
    const all = await remote.pull(null);
    expect(all.map((r) => r.id)).toEqual(table.map((r) => r.id));
    expect(log.length).toBe(3);
    const since = await remote.pull(new Date(tsMs(pgTs(2400))).toISOString());
    expect(since[0].id).toBe(docRow(2395, '').id);
    expect(since).toHaveLength(105);
  });

  it('does not loop or skip when more rows than a page share one timestamp', async () => {
    const table = [
      docRow(0, pgTs(1)),
      ...Array.from({ length: 1700 }, (_, i) => docRow(i + 1, pgTs(2))),
      ...Array.from({ length: 30 }, (_, i) => docRow(i + 2000, pgTs(3))),
    ];
    const { client } = mockClient(table);
    const rows = await new SupabaseRemote(client, A).pull(null);
    expect(new Set(rows.map((r) => r.id)).size).toBe(table.length);
    expect(rows).toHaveLength(table.length);
  });

  it('pushes lists before everything else, in chunks, never sending owner or server_ts', async () => {
    const { client, log } = mockClient([]);
    const rows: RemoteRow[] = [
      ...Array.from({ length: 600 }, (_, i) => ({ ...(docRow(i, pgTs(1)) as unknown as RemoteRow) })),
      { id: 'L', kind: 'list', list_id: 'L', data: { name: 'L' }, updated_at: 1, deleted: false, owner: A, server_ts: pgTs(1) },
    ];
    const res = await new SupabaseRemote(client, A).push(rows);
    expect(res.rejected).toEqual([]);
    expect(log.map((l) => l.split(',').length)).toEqual([1, 500, 100]);
    expect(log[0]).toBe('upsert L');
  });

  it('isolates rows refused by row-level security and reports them', async () => {
    const bad = new Set(['t00003', 't00011']);
    const { client } = mockClient([], {
      upsert: (body) =>
        body.some((r) => bad.has(String(r.id)))
          ? { error: { message: 'new row violates row-level security policy for table "docs"', code: '42501' }, status: 403 }
          : { error: null, status: 201 },
    });
    const rows = Array.from({ length: 16 }, (_, i) => docRow(i, pgTs(1)) as unknown as RemoteRow);
    const res = await new SupabaseRemote(client, A).push(rows);
    expect(res.rejected.sort()).toEqual([...bad].sort());
  });

  it('fails the whole push on auth or server problems instead of dropping rows', async () => {
    const rows = [docRow(1, pgTs(1)) as unknown as RemoteRow];
    const denied = mockClient([], { upsert: () => ({ error: { message: 'permission denied for table docs', code: '42501' }, status: 401 }) });
    await expect(new SupabaseRemote(denied.client, A).push(rows)).rejects.toBeInstanceOf(RemoteError);
    const offline = mockClient([], { upsert: () => ({ error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }) });
    await expect(new SupabaseRemote(offline.client, A).push(rows)).rejects.toBeInstanceOf(SyncOfflineError);
    const signedOut = mockClient([], { session: false });
    await expect(new SupabaseRemote(signedOut.client, A).push(rows)).rejects.toBeInstanceOf(RemoteError);
    expect(signedOut.log).toEqual([]);
  });

  it('reads one doc and the user\u2019s memberships', async () => {
    const table: Row[] = [docRow(1, pgTs(1)), { id: `hero:${A}`, kind: 'hero', list_id: null, data: {}, updated_at: '42', deleted: false, server_ts: pgTs(2) }];
    const { client } = mockClient(table);
    const remote = new SupabaseRemote(client, A);
    expect((await remote.pullDoc(`hero:${A}`))?.updated_at).toBe(42);
    expect(await remote.pullDoc('nope')).toBeNull();
    expect((await remote.pullList('L')).map((r) => r.id)).toEqual(['t00001']);
    const members = mockClient([{ list_id: 'L', user_id: A }, { list_id: 'M', user_id: B }, { list_id: 'N', user_id: A }]);
    expect((await new SupabaseRemote(members.client, A).memberships()).sort()).toEqual(['L', 'N']);
  });
});

describe('SupabaseRemote realtime and session edge cases', () => {
  it('a token refresh that fails offline makes the push offline, not an error', async () => {
    const rows = [docRow(1, pgTs(1)) as unknown as RemoteRow];
    const m = mockClient([], { session: false, sessionError: new AuthRetryableFetchError('Failed to fetch', 0) });
    await expect(new SupabaseRemote(m.client, A).push(rows)).rejects.toBeInstanceOf(SyncOfflineError);
    expect(m.log).toEqual([]);
  });

  it('subscribes to docs and to this user’s own memberships, and asks for a resync when needed', () => {
    const m = mockClient([]);
    const got: RemoteRow[] = [];
    let resyncs = 0;
    const off = new SupabaseRemote(m.client, A).subscribe((r) => got.push(r), () => resyncs++);
    const ch = m.channels[0];
    const docs = ch.listeners.find((l) => l.filter.table === 'docs')!;
    const members = ch.listeners.find((l) => l.filter.table === 'list_members')!;
    expect(members.filter.filter).toBe(`user_id=eq.${A}`);
    docs.cb({ eventType: 'UPDATE', new: { ...docRow(1, pgTs(1)), updated_at: '7', list_id: undefined } });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ id: 't00001', updated_at: 7, list_id: null, deleted: false });
    docs.cb({ eventType: 'DELETE', old: { id: 't00001' } });
    expect(got).toHaveLength(1);
    docs.cb({ eventType: 'UPDATE', new: { id: 't00002' } }); // payload without data (too large / unchanged toast)
    expect(resyncs).toBe(1);
    members.cb({ eventType: 'INSERT', new: { list_id: 'L', user_id: A } });
    expect(resyncs).toBe(2);
    ch.status!('SUBSCRIBED');
    expect(resyncs).toBe(2); // the first join is covered by start()'s own sync
    ch.status!('CHANNEL_ERROR');
    ch.status!('SUBSCRIBED');
    expect(resyncs).toBe(3); // a reconnect may have missed events
    off();
    expect(ch.removed).toBe(true);
  });
});

describe('auth from the stored session', () => {
  const memoryStorage = () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    return store;
  };
  const saved = { access_token: 'expired', refresh_token: 'r1', expires_at: 1, user: { id: A, email: 'a@test' } };

  it('stays signed in offline when the access token expired and cannot be refreshed yet', async () => {
    const store = memoryStorage();
    setSyncConfig({ url: 'https://example.supabase.co/', anonKey: 'anon-key-for-tests' });
    store.set('questlog-auth', JSON.stringify(saved));
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    expect(await getUser()).toEqual({ id: A, email: 'a@test' });
    // refresh token revoked / signed out: no session and no network error -> signed out
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await getUser()).toBeNull();
    // a garbled stored session is not a user
    store.set('questlog-auth', '{"user":{}}');
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    expect(await getUser()).toBeNull();
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: B, email: null } } }, error: null });
    expect(await getUser()).toEqual({ id: B, email: null });
  });

  it('signing out offline still forgets the session on this device', async () => {
    const store = memoryStorage();
    setSyncConfig({ url: 'https://example.supabase.co', anonKey: 'anon-key-for-tests' });
    store.set('questlog-auth', JSON.stringify(saved));
    auth.signOut.mockResolvedValue({ error: new AuthRetryableFetchError('Failed to fetch', 0) });
    await signOut();
    expect(store.has('questlog-auth')).toBe(false);
    // a real server refusal is reported, not papered over
    store.set('questlog-auth', JSON.stringify(saved));
    auth.signOut.mockResolvedValue({ error: new Error('boom') });
    await expect(signOut()).rejects.toThrow();
    expect(store.has('questlog-auth')).toBe(true);
  });

  it('a malformed project URL reads as "not set up" with a clear message instead of throwing', async () => {
    memoryStorage();
    setSyncConfig({ url: 'https://abc .supabase.co', anonKey: 'anon-key-for-tests' });
    expect(getClient()).toBeNull();
    expect(onAuthChange(() => undefined)).toBeTypeOf('function');
    await expect(getUser()).resolves.toBeNull();
    await expect(signIn('a@test', 'secret1')).rejects.toThrow(/Project URL looks wrong/);
    setSyncConfig({ url: ' https://abc.supabase.co/rest/v1/ ', anonKey: ' anon-key-for-tests ' });
    expect(getSyncConfig()).toEqual({ url: 'https://abc.supabase.co', anonKey: 'anon-key-for-tests' });
    expect(getClient()).not.toBeNull();
    setSyncConfig(null);
    expect(getClient()).toBeNull();
  });

  it('the initial auth event falls back to the stored session; sign-out events do not', async () => {
    const store = memoryStorage();
    setSyncConfig({ url: 'https://example.supabase.co', anonKey: 'anon-key-for-tests' });
    store.set('questlog-auth', JSON.stringify(saved));
    let emit: (event: string, session: unknown) => void = () => {};
    const unsubscribe = vi.fn();
    auth.onAuthStateChange.mockImplementation((cb: typeof emit) => ((emit = cb), { data: { subscription: { unsubscribe } } }));
    auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    const seen: (string | null)[] = [];
    const off = onAuthChange((u) => seen.push(u?.id ?? null));
    emit('INITIAL_SESSION', null);
    await vi.waitFor(() => expect(seen).toEqual([A]));
    emit('SIGNED_OUT', null);
    await vi.waitFor(() => expect(seen).toEqual([A, null]));
    emit('TOKEN_REFRESHED', { user: { id: A, email: 'a@test' } });
    await vi.waitFor(() => expect(seen).toEqual([A, null, A]));
    off();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('party helpers', () => {
  it('normalizes typed codes and pasted invite links', () => {
    expect(normalizeCode(' k7x-q2m ')).toBe('K7XQ2M');
    expect(normalizeCode('https://me.github.io/TODOLIST/#join=K7XQ2M')).toBe('K7XQ2M');
    expect(normalizeCode('HTTPS://ME.GITHUB.IO/TODOLIST/#JOIN=K7XQ2M')).toBe('K7XQ2M');
    expect(inviteUrl('K7XQ2M')).toMatch(/#join=K7XQ2M$/);
  });

  it('turns any profile row into a sane party member', () => {
    expect(toMember({ user_id: B, role: 'member', name: null, data: null })).toEqual({
      userId: B, role: 'member', name: 'Adventurer', level: 1, appearance: undefined, classId: undefined, title: undefined,
    });
    expect(toMember({ user_id: A, role: 'owner', name: ' Ayla ', data: { level: 1e6 + 0.7, classId: 'mage', title: 'Slayer' } })).toMatchObject({
      name: 'Ayla', level: 1e6, classId: 'mage', title: 'Slayer',
    });
    expect(toMember({ user_id: A, role: 'owner', name: 'x', data: { level: 'NaN' } }).level).toBe(1);
  });
});
