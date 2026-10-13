// Test helper: an in-memory Supabase "docs" backend that mirrors supabase/schema.sql (RLS, owner column,
// last-write-wins trigger, memberships, invites, realtime) for the sync engine and app-wiring tests.
import type { Counter, Hero, Item, PotionStack, Task, TaskList } from '../core/types';
import { HERO_ID, SyncEngine, tsMs } from './engine';
import { canon } from './merge';
import { SyncOfflineError } from './types';
import type { EngineStatus, LocalSnapshot, PushResult, RemoteAdapter, RemoteRow } from './types';

interface ServerRow extends RemoteRow {
  owner: string;
  server_ts: string;
}

interface Sub {
  user: string;
  onRow: (r: RemoteRow) => void;
  onMembership?: () => void;
}

/** JSON round trip that also reorders keys the way jsonb does (by length, then bytes). */
export function jsonb<T>(v: T): T {
  const re = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(re);
    if (x && typeof x === 'object') {
      const keys = Object.keys(x).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
      return Object.fromEntries(keys.map((k) => [k, re((x as Record<string, unknown>)[k])]));
    }
    return x;
  };
  return re(JSON.parse(JSON.stringify(v))) as T;
}

export class FakeServer {
  rows = new Map<string, ServerRow>();
  members = new Map<string, Map<string, 'owner' | 'member'>>();
  invites = new Map<string, string>();
  private tick = 0;
  private subs = new Set<Sub>();
  private queue: (() => void)[] = [];

  private stamp(): string {
    return new Date(Date.UTC(2026, 0, 1) + ++this.tick * 1000).toISOString();
  }

  isMember(listId: string, user: string): boolean {
    return this.members.get(listId)?.has(user) ?? false;
  }

  visible(row: ServerRow, user: string): boolean {
    return row.list_id === null ? row.owner === user : this.isMember(row.list_id, user);
  }

  /** docs policies + triggers. Returns false where Postgres would refuse the row. */
  upsert(user: string, r: RemoteRow): boolean {
    const shape =
      (r.kind === 'list' && r.list_id === r.id) || (r.kind === 'task' && r.list_id !== null) || (['hero', 'item', 'potion'].includes(r.kind) && r.list_id === null);
    if (!shape) return false;
    // own_doc_id(): an id in a personal namespace must match the row's kind and the caller
    const ownId =
      !/^(hero|item|potion):/.test(r.id) || (['hero', 'item', 'potion'].includes(r.kind) && (r.id === `${r.kind}:${user}` || r.id.startsWith(`${r.kind}:${user}:`)));
    const taken = this.rows.has(r.id) || this.members.has(r.id);
    const insertOk = ownId && (r.list_id === null || this.isMember(r.list_id, user) || (r.kind === 'list' && !taken));
    if (!insertOk) return false;
    const old = this.rows.get(r.id);
    const data = jsonb(r.data);
    if (!old) {
      const row: ServerRow = { id: r.id, kind: r.kind, list_id: r.list_id, data, updated_at: r.updated_at, deleted: r.deleted, owner: user, server_ts: this.stamp() };
      this.rows.set(r.id, row);
      if (r.kind === 'list') this.addMember(r.id, user, 'owner');
      this.broadcast(row);
      return true;
    }
    if (!this.visible(old, user)) return false;
    const next: ServerRow = { ...old, list_id: r.list_id, data, updated_at: r.updated_at, deleted: r.deleted };
    if (!this.visible(next, user)) return false;
    if (next.updated_at < old.updated_at) {
      this.broadcast(old); // trigger returns OLD: the update is a no-op that re-announces the server copy
      return true;
    }
    const row = { ...next, server_ts: this.stamp() };
    this.rows.set(r.id, row);
    this.broadcast(row);
    return true;
  }

  private addMember(listId: string, user: string, role: 'owner' | 'member') {
    const m = this.members.get(listId) ?? new Map();
    if (!m.has(user)) m.set(user, role);
    this.members.set(listId, m);
    this.membershipChanged(listId);
  }

  createInvite(user: string, listId: string): string {
    if (!this.isMember(listId, user)) throw new Error('not a member of this list');
    const code = `K${this.invites.size + 1}XQ2M`;
    this.invites.set(code, listId);
    return code;
  }

  joinList(user: string, code: string): string {
    const listId = this.invites.get(code);
    if (!listId) throw new Error('invalid invite code');
    this.addMember(listId, user, 'member');
    return listId;
  }

  leaveList(user: string, listId: string): void {
    this.members.get(listId)?.delete(user);
    this.membershipChanged(listId);
  }

  subscribe(sub: Sub): () => void {
    this.subs.add(sub);
    return () => this.subs.delete(sub);
  }

  private broadcast(row: ServerRow) {
    for (const s of this.subs) if (this.visible(row, s.user)) this.queue.push(() => s.onRow(jsonb(row)));
  }

  private membershipChanged(listId: string) {
    for (const s of this.subs) if (this.isMember(listId, s.user) || s.onMembership) this.queue.push(() => s.onMembership?.());
  }

  /** Deliver queued realtime events. */
  deliver() {
    for (const fn of this.queue.splice(0)) fn();
  }

  view(user: string): ServerRow[] {
    return [...this.rows.values()].filter((r) => this.visible(r, user));
  }
}

export class FakeRemote implements RemoteAdapter {
  online = true;
  pushCalls = 0;
  pushedIds: string[] = [];
  constructor(
    readonly server: FakeServer,
    readonly user: string,
  ) {}

  private gate() {
    if (!this.online) throw new SyncOfflineError();
  }

  async pull(since: string | null): Promise<RemoteRow[]> {
    this.gate();
    const from = since ? tsMs(since) - 5000 : -Infinity;
    return this.server
      .view(this.user)
      .filter((r) => tsMs(r.server_ts) >= from)
      .sort((a, b) => tsMs(a.server_ts) - tsMs(b.server_ts))
      .map((r) => jsonb(r));
  }

  async pullList(listId: string): Promise<RemoteRow[]> {
    this.gate();
    return this.server
      .view(this.user)
      .filter((r) => r.list_id === listId)
      .map((r) => jsonb(r));
  }

  async pullDoc(id: string): Promise<RemoteRow | null> {
    this.gate();
    const r = this.server.rows.get(id);
    return r && this.server.visible(r, this.user) ? jsonb(r) : null;
  }

  async memberships(): Promise<string[]> {
    this.gate();
    return [...this.server.members].filter(([, m]) => m.has(this.user)).map(([id]) => id);
  }

  async push(rows: RemoteRow[]): Promise<PushResult> {
    this.gate();
    this.pushCalls++;
    const rejected: string[] = [];
    for (const r of [...rows.filter((x) => x.kind === 'list'), ...rows.filter((x) => x.kind !== 'list')]) {
      this.pushedIds.push(r.id);
      if (!this.server.upsert(this.user, r)) rejected.push(r.id);
    }
    return { rejected };
  }

  subscribe(onRow: (row: RemoteRow) => void, onMembership?: () => void): () => void {
    return this.server.subscribe({ user: this.user, onRow, onMembership });
  }
}

// ---------------------------------------------------------------- a device: store-like state + engine

const inc = (c: Counter, dev: string, n: number): Counter => ({ ...c, [dev]: (c[dev] ?? 0) + n });

export function makeHero(name: string, createdAt: number): Hero {
  return {
    id: HERO_ID, name, classId: 'knight', createdAt, updatedAt: createdAt,
    appearance: { race: 'human', skin: 1, hair: 'short', hairColor: '#2a1e1a', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#3a3a4a' },
    xp: {}, gold: {}, goldSpent: {}, kills: {}, tasksDone: {}, skillXp: {}, activeDays: [],
    equipped: {}, buffs: [], bagSize: 24, bossIndex: 1, bossDamage: {}, bossesSlain: {}, itemsFound: {}, potionsUsed: {},
    questsCleared: {}, achievements: {}, owned: [], streakSaves: 0, savedDays: [],
  };
}

export class Device {
  snap: LocalSnapshot = { hero: null, lists: {}, tasks: {}, items: {}, potions: {} };
  readonly kv = new Map<string, string>();
  readonly remote: FakeRemote;
  readonly engine: SyncEngine;
  writes = 0;
  statuses: EngineStatus[] = [];

  constructor(
    server: FakeServer,
    readonly user: string,
    readonly deviceId: string,
    public clock = 1_000_000,
  ) {
    this.remote = new FakeRemote(server, user);
    const local = {
      deviceId,
      read: () => this.snap,
      write: (patch: Partial<LocalSnapshot>) => {
        this.writes++;
        this.snap = { ...this.snap, ...patch };
      },
    };
    const kv = { get: (k: string) => this.kv.get(k) ?? null, set: (k: string, v: string) => void this.kv.set(k, v) };
    this.engine = new SyncEngine(local, this.remote, kv, user, { intervalMs: 0, pushDelayMs: 100 });
    this.engine.onStatus((s) => this.statuses.push(s));
  }

  now() {
    return (this.clock += 7);
  }

  set online(v: boolean) {
    this.remote.online = v;
  }

  createHero(name: string) {
    this.snap = { ...this.snap, hero: makeHero(name, this.now()) };
  }

  editHero(fn: (h: Hero) => Partial<Hero>) {
    const h = this.snap.hero!;
    this.snap = { ...this.snap, hero: { ...h, ...fn(h), updatedAt: this.now() } };
  }

  addList(id: string, name: string, extra: Partial<TaskList> = {}) {
    const t = this.now();
    const list: TaskList = { id, name, color: '#5b6ee1', theme: 'forest', type: 'quests', skill: 'lore', order: 0, createdAt: t, updatedAt: t, ...extra };
    this.snap = { ...this.snap, lists: { ...this.snap.lists, [id]: list } };
  }

  addTask(id: string, listId: string, title: string) {
    const t = this.now();
    const task: Task = { id, listId, title, difficulty: 2, repeat: { kind: 'none' }, order: 0, createdAt: t, updatedAt: t, timesDone: 0 };
    this.snap = { ...this.snap, tasks: { ...this.snap.tasks, [id]: task } };
  }

  editTask(id: string, patch: Partial<Task>, at = this.now()) {
    this.snap = { ...this.snap, tasks: { ...this.snap.tasks, [id]: { ...this.snap.tasks[id], ...patch, updatedAt: at } } };
  }

  deleteTask(id: string) {
    this.editTask(id, { deleted: true });
  }

  /** Complete a task: reward goes to this device's counters, like the store's toggleTask. */
  complete(id: string, xp: number) {
    this.editTask(id, { doneFor: 'once', doneBy: this.snap.hero?.name, timesDone: (this.snap.tasks[id].timesDone ?? 0) + 1 });
    this.editHero((h) => ({ xp: inc(h.xp, this.deviceId, xp), tasksDone: inc(h.tasksDone, this.deviceId, 1), gold: inc(h.gold, this.deviceId, 3) }));
  }

  addItem(id: string, name: string) {
    const t = this.now();
    const item: Item = {
      id, slot: 'weapon', base: 'sword', material: 0, rarity: 0, ilvl: 1, power: 1, upgrade: 0, affixes: [], name, seed: 1, createdAt: t, updatedAt: t,
    };
    this.snap = { ...this.snap, items: { ...this.snap.items, [id]: item } };
  }

  addPotion(potion: PotionStack['potion'], tier: number, count: number) {
    const id = `${potion}:${tier}`;
    this.snap = { ...this.snap, potions: { ...this.snap.potions, [id]: { id, potion, tier, count, updatedAt: this.now() } } };
  }

  /** Synced state without tombstones, canonical. */
  live(): string {
    const f = <T extends { deleted?: boolean }>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([, d]) => !d.deleted));
    const s = this.snap;
    return canon({ hero: s.hero, lists: f(s.lists), tasks: f(s.tasks), items: f(s.items), potions: f(s.potions) });
  }

  liveTasks(): string[] {
    return Object.values(this.snap.tasks)
      .filter((t) => !t.deleted)
      .map((t) => t.id)
      .sort();
  }
}
