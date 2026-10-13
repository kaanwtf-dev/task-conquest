// Local-first sync engine: the store stays the source of truth on each device; the engine pulls remote
// changes, merges them in (LWW per doc, CRDT for the hero) and pushes local edits it has not sent yet.
// Dirty tracking never touches the store: a persisted map remembers the updatedAt last exchanged per doc.
import type { Difficulty, Hero, ListType, Meta, Repeat, SkillId, Task, TaskList } from '../core/types';
import type { ThemeId } from '../pixel/themes';
import { canon, lineage, newer, resolveHero, sameDoc } from './merge';
import { SyncOfflineError } from './types';
import type { AdoptStrategy, DocKind, EngineStatus, KeyValue, LocalAdapter, LocalSnapshot, RemoteAdapter, RemoteRow } from './types';

type Coll = 'lists' | 'tasks' | 'items' | 'potions';
type DocMap = Record<string, Meta>;
type CollKind = Exclude<DocKind, 'hero'>;

const COLLS: readonly (readonly [CollKind, Coll])[] = [
  ['list', 'lists'],
  ['task', 'tasks'],
  ['item', 'items'],
  ['potion', 'potions'],
];
const COLL_OF: Record<CollKind, Coll> = { list: 'lists', task: 'tasks', item: 'items', potion: 'potions' };

/** Local id of the (single) hero doc. */
export const HERO_ID = 'hero';
export const PUSH_DELAY_MS = 1500;
export const SYNC_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------- doc <-> row mapping

/** Remote ids: hero:<user>, item:<user>:<id>, potion:<user>:<id> (personal ids are not globally unique); lists/tasks keep theirs. */
export function remoteId(kind: DocKind, localId: string, userId: string): string {
  if (kind === 'hero') return `hero:${userId}`;
  if (kind === 'item' || kind === 'potion') return `${kind}:${userId}:${localId}`;
  return localId;
}

export function toRow(kind: DocKind, doc: Meta, userId: string): RemoteRow {
  return {
    id: remoteId(kind, kind === 'hero' ? HERO_ID : doc.id, userId),
    kind,
    list_id: kind === 'list' ? doc.id : kind === 'task' ? (doc as Task).listId : null,
    data: { ...(doc as unknown as Record<string, unknown>), ...(kind === 'hero' ? { id: HERO_ID } : {}) },
    updated_at: Math.trunc(doc.updatedAt),
    deleted: !!doc.deleted,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

// Closed sets the UI looks tables up by. A shared doc outside them (a newer app version, a bad actor in a
// party) would crash rendering on every launch, so it is not applied. Records, so that a new member of
// one of these unions fails to compile until it is added here.
const LIST_TYPES: Record<ListType, true> = { daily: true, weekly: true, quests: true, supply: true, custom: true };
const THEMES: Record<ThemeId, true> = { tavern: true, forest: true, beach: true, dungeon: true, snow: true, desert: true, castle: true, volcano: true };
const SKILLS: Record<SkillId, true> = {
  athletics: true, hearthcraft: true, mercantile: true, lore: true, smithing: true,
  alchemy: true, speech: true, restoration: true, artistry: true, wayfaring: true,
};
const DIFFICULTIES: Record<Difficulty, true> = { 0: true, 1: true, 2: true, 3: true, 4: true };
const REPEATS: Record<Repeat['kind'], (r: Record<string, unknown>) => boolean> = {
  none: () => true,
  daily: () => true,
  weekly: () => true,
  monthly: () => true,
  days: (r) => Array.isArray(r.days) && r.days.every((x) => Number.isInteger(x) && x >= 0 && x <= 6),
  interval: (r) => typeof r.every === 'number' && Number.isFinite(r.every) && isStr(r.anchor),
};
const oneOf = (set: object, v: unknown): boolean => isStr(v) && Object.hasOwn(set, v);
const validRepeat = (r: unknown): boolean => isObj(r) && oneOf(REPEATS, r.kind) && REPEATS[r.kind as Repeat['kind']](r);

/** Shape checks so a malformed row (old or newer client, bad actor in a shared list) never reaches the UI. */
function plausible(kind: DocKind, d: Record<string, unknown>): boolean {
  switch (kind) {
    case 'hero':
      return isStr(d.name) && isObj(d.appearance) && isStr(d.classId);
    case 'list':
      return isStr(d.name) && oneOf(LIST_TYPES, d.type) && oneOf(THEMES, d.theme) && oneOf(SKILLS, d.skill);
    case 'task':
      return (
        isStr(d.listId) && isStr(d.title) && typeof d.difficulty === 'number' && Object.hasOwn(DIFFICULTIES, d.difficulty) && validRepeat(d.repeat)
      );
    case 'item':
      return isStr(d.slot) && isStr(d.base);
    case 'potion':
      return isStr(d.potion) && typeof d.count === 'number';
    default:
      return false;
  }
}

export function fromRow(row: RemoteRow, userId: string): { kind: DocKind; doc: Meta } | null {
  if (!row || !isObj(row.data) || !isStr(row.id)) return null;
  let id: string;
  switch (row.kind) {
    case 'hero':
      if (row.id !== `hero:${userId}`) return null;
      id = HERO_ID;
      break;
    case 'item':
    case 'potion': {
      const prefix = `${row.kind}:${userId}:`;
      if (!row.id.startsWith(prefix)) return null;
      id = row.id.slice(prefix.length);
      break;
    }
    case 'list':
    case 'task':
      id = row.id;
      break;
    default:
      return null;
  }
  if (!plausible(row.kind, row.data)) return null;
  // access is checked against list_id: a task filed under a shared list must not land in another list here
  if (row.kind === 'task' && row.data.listId !== row.list_id) return null;
  const updatedAt = Number(row.updated_at);
  const doc: Meta & Record<string, unknown> = { ...row.data, id, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
  if (row.deleted) doc.deleted = true;
  else delete doc.deleted;
  // list ownership is the server's (immutable owner column), never a doc field a stale edit could clear;
  // someone else's list that we can see is by definition shared with us
  if (row.kind === 'list' && isStr(row.owner)) {
    if (row.owner !== userId) {
      doc.ownerId = row.owner;
      doc.shared = true;
    } else if (isStr(doc.ownerId) && doc.ownerId !== userId) doc.ownerId = userId;
  }
  return { kind: row.kind, doc };
}

const docKey = (kind: DocKind, id: string) => `${kind}/${id}`;

/** Postgres / realtime timestamp -> epoch ms ('2026-10-13T12:34:56.123456+00:00', '... 12:34:56.1+00', ISO 'Z'). */
export function tsMs(s: string): number {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(s.trim());
  if (!m) return Date.parse(s);
  const frac = (m[3] ?? '.000').slice(0, 4).padEnd(4, '0');
  let tz = (m[4] ?? 'Z').toUpperCase();
  if (/^[+-]\d{2}$/.test(tz)) tz += ':00';
  else if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
  return Date.parse(`${m[1]}T${time}${frac}${tz}`);
}

const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

// ---------------------------------------------------------------- persisted engine state

interface Persisted {
  /** server_ts of the newest pulled row (ISO). */
  cursor: string | null;
  /** doc key -> updatedAt the server is known to hold (pushed or pulled). */
  synced: Record<string, number>;
  /** list ids the user was a member of at the last full sync (null = not looked yet). */
  lists: string[] | null;
}

const fresh = (): Persisted => ({ cursor: null, synced: {}, lists: null });

// ---------------------------------------------------------------- browser hooks

function watchWindow(wake: () => void, hide: () => void, offline: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  const doc = typeof document !== 'undefined' ? document : undefined;
  const vis = () => (doc?.visibilityState === 'hidden' ? hide() : wake());
  window.addEventListener('online', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('offline', offline);
  window.addEventListener('pagehide', hide);
  doc?.addEventListener('visibilitychange', vis);
  return () => {
    window.removeEventListener('online', wake);
    window.removeEventListener('focus', wake);
    window.removeEventListener('offline', offline);
    window.removeEventListener('pagehide', hide);
    doc?.removeEventListener('visibilitychange', vis);
  };
}

const running = new Set<SyncEngine>();

/** Sync every started engine now (e.g. so a brand-new list exists in the cloud before inviting to it). */
export async function flushSync(): Promise<void> {
  await Promise.all([...running].map((e) => e.syncNow()));
}

// ---------------------------------------------------------------- engine

export interface SyncEngineOptions {
  /** Debounce between a local edit and its push (ms). */
  pushDelayMs?: number;
  /** Periodic full sync (ms); 0 disables. */
  intervalMs?: number;
}

export class SyncEngine {
  status: EngineStatus = 'idle';
  /** Remote ids the server refused on the last push (no permission / invalid data). */
  lastRejected: string[] = [];

  private readonly local: LocalAdapter;
  private readonly remote: RemoteAdapter;
  private readonly kv: KeyValue;
  private readonly userId: string;
  private readonly kvKey: string;
  private readonly pushDelay: number;
  private readonly intervalMs: number;
  private st: Persisted;
  private readonly listeners = new Set<(s: EngineStatus) => void>();
  private pending: { pull: boolean } | null = null;
  private loop: Promise<void> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private cleanup: (() => void)[] = [];
  private started = false;
  private stopped = false;
  private lastWake = 0;
  /** Lists purged here: rows for them still in flight (a pull begun before leaving) are dropped until rejoined. */
  private readonly left = new Set<string>();
  /** Lists left here whose leave hasn't reached the server yet: never pulled back in the meantime. */
  private readonly leaving = new Set<string>();

  constructor(local: LocalAdapter, remote: RemoteAdapter, kv: KeyValue, userId: string, opts: SyncEngineOptions = {}) {
    this.local = local;
    this.remote = remote;
    this.kv = kv;
    this.userId = userId;
    this.kvKey = `questlog-sync:${userId}`;
    this.pushDelay = opts.pushDelayMs ?? PUSH_DELAY_MS;
    this.intervalMs = opts.intervalMs ?? SYNC_INTERVAL_MS;
    this.st = this.load();
  }

  /** Initial pull + push, then realtime, a periodic re-sync and re-syncs on focus / reconnect. */
  async start(): Promise<void> {
    if (this.started || this.stopped) return;
    this.started = true;
    running.add(this);
    this.cleanup.push(
      this.remote.subscribe(
        (row) => this.apply([row]),
        () => void this.request(true),
      ),
    );
    if (this.intervalMs > 0) {
      const timer = setInterval(() => void this.request(true), this.intervalMs);
      this.cleanup.push(() => clearInterval(timer));
    }
    this.cleanup.push(
      watchWindow(
        () => this.wake(),
        () => this.flush(),
        () => this.setStatus('offline'),
      ),
    );
    await this.request(true);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    running.delete(this);
    clearTimeout(this.pushTimer);
    for (const fn of this.cleanup.splice(0)) fn();
    this.listeners.clear();
  }

  /** Full sync (pull, merge, push). Never rejects; failures show up in `status`. */
  syncNow(): Promise<void> {
    return this.request(true);
  }

  onStatus(cb: (s: EngineStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Call after every local write; pushes are debounced. */
  notifyLocalChange(): void {
    if (this.stopped) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = undefined;
      void this.request(false);
    }, this.pushDelay);
  }

  /** Fetch a list's existing docs (after joining it: they are older than the pull cursor). */
  async pullList(listId: string): Promise<void> {
    const rows = await this.remote.pullList(listId);
    if (this.stopped) return;
    this.left.delete(listId);
    this.leaving.delete(listId);
    this.apply(rows);
    if (this.st.lists && !this.st.lists.includes(listId)) this.st.lists = [...this.st.lists, listId].sort();
    this.save();
  }

  /**
   * Drop a list and its tasks from this device without tombstoning them (after leaving it). `pending`:
   * the server doesn't know yet (offline), so membership still lists it until leaveConfirmed().
   */
  purgeList(listId: string, pending = false): void {
    this.left.add(listId);
    if (pending) this.leaving.add(listId);
    const snap = this.local.read();
    const lists = { ...snap.lists };
    const tasks = { ...snap.tasks };
    delete lists[listId];
    delete this.st.synced[docKey('list', listId)];
    for (const t of Object.values(snap.tasks ?? {})) {
      if (t.listId !== listId) continue;
      delete tasks[t.id];
      delete this.st.synced[docKey('task', t.id)];
    }
    this.local.write({ lists, tasks });
    if (this.st.lists) this.st.lists = this.st.lists.filter((id) => id !== listId);
    this.save();
  }

  /** The server has processed a pending leave. */
  leaveConfirmed(listId: string): void {
    this.leaving.delete(listId);
  }

  async inspectRemoteHero(): Promise<Hero | null> {
    const row = await this.remote.pullDoc(remoteId('hero', HERO_ID, this.userId));
    const m = row ? fromRow(row, this.userId) : null;
    return m && m.kind === 'hero' && !m.doc.deleted ? (m.doc as Hero) : null;
  }

  /**
   * First sign-in on a device that already has a different hero than the cloud:
   * - merge: adopt the cloud hero's lineage so both saves' progress adds up; lists/items are united
   * - cloud: replace this device's data with the cloud's
   * - local: this device wins; the cloud's own unshared lists, items and potions that this device
   *   does not have are deleted, and its hero replaces the cloud hero on every device
   */
  async adoptStrategy(strategy: AdoptStrategy): Promise<void> {
    if (strategy === 'merge') {
      const cloud = await this.inspectRemoteHero();
      const mine = this.local.read().hero;
      if (cloud && mine && cloud.createdAt !== mine.createdAt) this.local.write({ hero: { ...mine, createdAt: cloud.createdAt } });
      this.st = { ...this.st, cursor: null, lists: null };
      this.save();
      return this.syncNow();
    }

    const rows = await this.remote.pull(null);
    if (this.stopped) return;
    const cloud = this.latest(rows);

    if (strategy === 'cloud') {
      const snap = this.local.read();
      const next: Pick<LocalSnapshot, Coll> = { lists: {}, tasks: {}, items: {}, potions: {} };
      const synced: Record<string, number> = {};
      let hero: Hero | null = null;
      for (const [key, { kind, doc }] of cloud) {
        if (doc.deleted) continue;
        synced[key] = doc.updatedAt;
        if (kind === 'hero') hero = doc as Hero;
        else (next[COLL_OF[kind]] as DocMap)[doc.id] = doc;
      }
      this.local.write({ ...next, hero: hero ?? snap.hero });
      this.st = { cursor: this.maxTs(rows), synced, lists: null };
      this.save();
      return;
    }

    // 'local'
    const snap = this.local.read();
    const patch: Partial<LocalSnapshot> = {};
    const cloudHero = cloud.get(docKey('hero', HERO_ID))?.doc as Hero | undefined;
    if (snap.hero && cloudHero) {
      // a newer lineage than the cloud's makes every device drop the old hero instead of merging into it
      patch.hero = {
        ...snap.hero,
        createdAt: Math.max(snap.hero.createdAt, cloudHero.createdAt + 1),
        updatedAt: Math.max(snap.hero.updatedAt, cloudHero.updatedAt + 1),
      };
    }
    for (const [kind, coll] of COLLS) {
      const mine = snap[coll] as DocMap;
      let copy: DocMap | null = null;
      for (const doc of Object.values(mine)) {
        const theirs = cloud.get(docKey(kind, doc.id))?.doc;
        if (theirs && theirs.updatedAt >= doc.updatedAt && !sameDoc(theirs, doc)) (copy ??= { ...mine })[doc.id] = { ...doc, updatedAt: theirs.updatedAt + 1 };
      }
      if (copy) (patch as Record<Coll, DocMap>)[coll] = copy;
    }
    const doomedLists = new Set<string>();
    for (const { kind, doc, row } of cloud.values()) {
      if (kind === 'list' && !doc.deleted && !snap.lists[doc.id] && row.owner === this.userId && (doc as { shared?: boolean }).shared !== true)
        doomedLists.add(doc.id);
    }
    const tombstones: RemoteRow[] = [];
    for (const { kind, doc } of cloud.values()) {
      if (doc.deleted || kind === 'hero' || (snap[COLL_OF[kind]] as DocMap)[doc.id]) continue;
      const doomed =
        kind === 'item' || kind === 'potion' || (kind === 'list' && doomedLists.has(doc.id)) || (kind === 'task' && doomedLists.has((doc as Task).listId));
      if (doomed) tombstones.push(toRow(kind, { ...doc, deleted: true, updatedAt: doc.updatedAt + 1 }, this.userId));
    }
    if (Object.keys(patch).length) this.local.write(patch);
    if (tombstones.length) await this.remote.push(tombstones);
    if (this.stopped) return;
    // push everything this device has, then pull the rest (shared lists stay)
    this.st = fresh();
    // the cloud hero was seen and overruled on purpose: its lineage is replaced, not merged as a first contact
    if (cloudHero && snap.hero) this.st.synced[docKey('hero', HERO_ID)] = cloudHero.updatedAt;
    this.save();
    return this.syncNow();
  }

  // ------------------------------------------------------------ internals

  private load(): Persisted {
    try {
      const raw = this.kv.get(this.kvKey);
      const p = raw ? (JSON.parse(raw) as Partial<Persisted>) : null;
      if (!p || typeof p !== 'object') return fresh();
      return {
        cursor: typeof p.cursor === 'string' ? p.cursor : null,
        synced: isObj(p.synced) ? (p.synced as Record<string, number>) : {},
        lists: Array.isArray(p.lists) ? p.lists.filter(isStr) : null,
      };
    } catch {
      return fresh();
    }
  }

  private save(): void {
    try {
      this.kv.set(this.kvKey, JSON.stringify(this.st));
    } catch {
      // storage full: state is rebuilt from the server on the next full pull
    }
  }

  private setStatus(s: EngineStatus): void {
    if (s === this.status) return;
    this.status = s;
    for (const cb of [...this.listeners]) cb(s);
  }

  private wake(): void {
    const t = Date.now();
    if (t - this.lastWake < 3000) return; // focus + visibilitychange arrive together
    this.lastWake = t;
    void this.request(true);
  }

  /** Push a pending debounced change right away (app going to the background). */
  private flush(): void {
    if (this.pushTimer === undefined) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = undefined;
    void this.request(false);
  }

  /** Queue a cycle; requests made while one runs are coalesced into the next. */
  private request(pull: boolean): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.pending = { pull: pull || (this.pending?.pull ?? false) };
    return (this.loop ??= this.drain());
  }

  private async drain(): Promise<void> {
    await null; // let request() store the promise before the loop can finish
    try {
      while (this.pending && !this.stopped) {
        const { pull } = this.pending;
        this.pending = null;
        await this.cycle(pull);
      }
    } finally {
      this.loop = null;
    }
  }

  private async cycle(pull: boolean): Promise<void> {
    if (offlineNow()) return this.setStatus('offline');
    if (!pull && !this.collect().rows.length) return; // nothing to push: stay quiet
    this.setStatus('syncing');
    try {
      if (pull) {
        await this.reconcileLists();
        if (this.stopped) return;
        const rows = await this.remote.pull(this.st.cursor);
        if (this.stopped) return;
        this.apply(rows);
        const cursor = this.maxTs(rows);
        if (cursor) {
          this.st.cursor = cursor;
          this.save();
        }
      }
      await this.push();
      if (!this.stopped) this.setStatus('idle');
    } catch (e) {
      if (!this.stopped) this.setStatus(e instanceof SyncOfflineError || offlineNow() ? 'offline' : 'error');
    }
  }

  /** Newest server_ts among rows and the current cursor, as ISO (null if none). */
  private maxTs(rows: RemoteRow[]): string | null {
    let max = this.st.cursor ? tsMs(this.st.cursor) : -Infinity;
    if (Number.isNaN(max)) max = -Infinity;
    for (const r of rows) {
      if (!r.server_ts) continue;
      const t = tsMs(r.server_ts);
      if (t > max) max = t;
    }
    return Number.isFinite(max) ? new Date(max).toISOString() : null;
  }

  /**
   * Lists joined on another device are older than the cursor, so fetch them whole; lists this user
   * no longer belongs to (left elsewhere) are dropped locally.
   */
  private async reconcileLists(): Promise<void> {
    const ids = [...new Set(await this.remote.memberships())].filter((id) => !this.leaving.has(id)).sort();
    if (this.stopped) return;
    const prev = this.st.lists;
    if (prev && this.st.cursor !== null) {
      const now = new Set(ids);
      for (const id of prev) if (!now.has(id)) this.purgeList(id);
      const known = new Set(prev);
      for (const id of ids) {
        if (known.has(id) && !this.left.has(id)) continue;
        const rows = await this.remote.pullList(id);
        if (this.stopped) return;
        this.left.delete(id); // (re)joined, here or on another device
        this.apply(rows);
      }
    } else for (const id of ids) this.left.delete(id); // a full pull follows
    this.st.lists = ids;
    this.save();
  }

  /** Newest version per doc among (possibly repeated) rows. */
  private latest(rows: RemoteRow[]): Map<string, { kind: CollKind | 'hero'; doc: Meta; row: RemoteRow }> {
    const out = new Map<string, { kind: CollKind | 'hero'; doc: Meta; row: RemoteRow }>();
    for (const row of rows) {
      const m = fromRow(row, this.userId);
      if (!m) continue;
      const key = docKey(m.kind, m.doc.id);
      const prev = out.get(key);
      if (!prev || newer(prev.doc, m.doc) === m.doc) out.set(key, { kind: m.kind, doc: m.doc, row });
    }
    return out;
  }

  /**
   * Merge remote rows into the store, writing only collections that actually changed. Whenever the local
   * copy must win (a lagging-clock edit, a tie-break, a hero merge holding more than the cloud copy) it is
   * restamped just above the server's version, so it reads as dirty, gets pushed and is accepted.
   */
  private apply(rows: RemoteRow[]): void {
    if (!rows.length || this.stopped) return;
    const snap = this.local.read();
    const out: Partial<Record<Coll, DocMap>> = {};
    const synced = this.st.synced;
    let hero = snap.hero;
    let heroChanged = false;
    let needPush = false;
    const put = (coll: Coll, doc: Meta) => {
      (out[coll] ??= { ...((snap[coll] ?? {}) as DocMap) })[doc.id] = doc;
    };
    for (const row of rows) {
      const m = fromRow(row, this.userId);
      if (!m) continue;
      const key = docKey(m.kind, m.doc.id);
      const remote = m.doc;
      if (m.kind === 'hero') {
        if (remote.deleted) continue;
        const known = synced[key];
        // dropped on this device after syncing (start over): an echo of the copy it held must not bring it back
        if (!hero && known !== undefined && remote.updatedAt <= known) continue;
        if (hero && known !== undefined && hero.updatedAt < known) {
          hero = { ...hero, updatedAt: known + 1 };
          heroChanged = needPush = true;
        }
        let base = hero;
        if (base && known === undefined && lineage(base) !== lineage(remote as Hero)) {
          // first contact with a different save that adoptStrategy() never settled (e.g. the check failed
          // offline): merge into the cloud's lineage, keeping its identity, rather than erase either save
          base = { ...base, createdAt: lineage(remote as Hero), updatedAt: Math.min(base.updatedAt, remote.updatedAt - 1) };
        }
        let merged = base ? resolveHero(base, remote as Hero) : (remote as Hero);
        const ahead = canon(merged) !== canon(remote);
        if (ahead && merged.updatedAt <= remote.updatedAt) merged = { ...merged, updatedAt: remote.updatedAt + 1 };
        if (!hero || canon(merged) !== canon(hero)) {
          hero = merged;
          heroChanged = true;
        }
        needPush ||= ahead;
        synced[key] = Math.max(synced[key] ?? -Infinity, remote.updatedAt);
        continue;
      }
      if (row.list_id && this.left.has(row.list_id)) continue;
      const coll = COLL_OF[m.kind];
      let cur: Meta | undefined = (out[coll] ?? ((snap[coll] ?? {}) as DocMap))[remote.id];
      if (cur && cur.updatedAt < (synced[key] ?? -Infinity)) {
        cur = { ...cur, updatedAt: synced[key] + 1 }; // edited on a clock behind the version already synced
        put(coll, cur);
        needPush = true;
      }
      if (!cur && remote.deleted) continue; // never had it: nothing to delete
      if (!cur || sameDoc(cur, remote) || newer(cur, remote) === remote) {
        const unshared = m.kind === 'list' && cur && (cur as TaskList).shared && !(remote as TaskList).shared;
        if (unshared) {
          // a list never stops being shared: a copy edited before it was shared (an offline device) must not
          // un-share it, or moves out of it would stop copying and members would keep ghost tasks
          const c = cur as TaskList;
          put(coll, { ...remote, shared: true, ownerId: (remote as TaskList).ownerId ?? c.ownerId, updatedAt: remote.updatedAt + 1 } as Meta);
          needPush = true;
        } else if (!cur || !sameDoc(cur, remote)) put(coll, remote);
        synced[key] = Math.max(synced[key] ?? -Infinity, remote.updatedAt);
      } else if (cur.updatedAt === remote.updatedAt) {
        put(coll, { ...cur, updatedAt: remote.updatedAt + 1 }); // ours wins the tie-break: make it strictly newer
        synced[key] = Math.max(synced[key] ?? -Infinity, remote.updatedAt);
        needPush = true;
      }
    }
    const patch = { ...out } as Partial<LocalSnapshot>;
    if (heroChanged) patch.hero = hero;
    if (Object.keys(patch).length) this.local.write(patch);
    this.save();
    if (needPush) this.notifyLocalChange();
  }

  /** Docs whose updatedAt differs from what the server is known to hold. */
  private collect(): { rows: RemoteRow[]; marks: [string, number][]; bumped: Partial<LocalSnapshot> | null } {
    const snap = this.local.read();
    const synced = this.st.synced;
    const rows: RemoteRow[] = [];
    const marks: [string, number][] = [];
    let bumped: Partial<LocalSnapshot> | null = null;
    const visit = (kind: DocKind, doc: Meta, coll: Coll | null) => {
      if (!Number.isFinite(doc.updatedAt)) return; // corrupt stamp: would be dirty forever
      const key = docKey(kind, kind === 'hero' ? HERO_ID : doc.id);
      const at = synced[key];
      if (at === doc.updatedAt) return;
      let d = doc;
      if (at !== undefined && doc.updatedAt < at) {
        // edited on a clock running behind the version already synced: restamp so the edit still wins
        d = { ...doc, updatedAt: at + 1 };
        bumped ??= {};
        if (coll) ((bumped as Record<Coll, DocMap>)[coll] ??= { ...((snap[coll] ?? {}) as DocMap) })[d.id] = d;
        else bumped.hero = d as Hero;
      }
      rows.push(toRow(kind, d, this.userId));
      marks.push([key, d.updatedAt]);
    };
    if (snap.hero) visit('hero', snap.hero, null);
    for (const [kind, coll] of COLLS) for (const doc of Object.values((snap[coll] ?? {}) as DocMap)) visit(kind, doc, coll);
    return { rows, marks, bumped };
  }

  private async push(): Promise<void> {
    const { rows, marks, bumped } = this.collect();
    if (bumped) this.local.write(bumped);
    if (!rows.length) return;
    const res = await this.remote.push(rows);
    this.lastRejected = res.rejected;
    // refused rows are marked too: they are retried when edited again, not on every cycle
    for (const [key, at] of marks) if (!(this.st.synced[key] > at)) this.st.synced[key] = at;
    this.save();
  }
}
