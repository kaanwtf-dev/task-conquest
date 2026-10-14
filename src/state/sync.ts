// App-side wiring for cloud sync: store <-> SyncEngine adapter, auth lifecycle, party join links.
import { create } from 'zustand';
import type { Hero, Task, TaskList } from '../core/types';
import { syncHooks, TODAY_ID, uid, useStore, visibleLists, type State } from './store';
import { fx } from './fx';
import { useAttention } from './attention';
import { heroLevel } from '../game/progression';
import { getClient, getSyncConfig, getUser, onAuthChange, signOut } from '../sync/supabase';
import { SyncEngine } from '../sync/engine';
import { SupabaseRemote } from '../sync/supabase';
import { joinList, leaveList, upsertProfile } from '../sync/party';
import type { LocalAdapter, LocalSnapshot } from '../sync/types';

export type SyncStatus = 'off' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';

interface SyncUi {
  status: SyncStatus;
  email: string | null;
  userId: string | null;
  /**
   * 'hero': first sign-in on this device while the cloud holds a different hero.
   * 'account': this device last synced with ANOTHER account — never push its data into this one silently.
   */
  conflict: { kind: 'hero'; cloudName: string; cloudLevel: number } | { kind: 'account' } | null;
  pendingJoin: string | null;
  /** Why the invite link this app was opened with could not be used. */
  joinError: string | null;
  lastSync: number | null;
}

export const useSync = create<SyncUi>(() => ({
  status: getSyncConfig() ? 'signed-out' : 'off',
  email: null,
  userId: null,
  conflict: null,
  pendingJoin: null,
  joinError: null,
  lastSync: null,
}));
// badge the Party tab while a choice there blocks syncing, or an invite link failed
useSync.subscribe((s) => {
  const party = !!s.conflict || !!s.joinError;
  if (useAttention.getState().party !== party) useAttention.setState({ party });
});

let engine: SyncEngine | null = null;
let engineUser: string | null = null;
let unsubStore: (() => void) | null = null;
let unsubAuth: (() => void) | null = null;
let profileTimer: number | undefined;
/** Engine writes made while this is > 0 are bulk loads (first pull, joining, adopting): no party toasts. */
let quiet = 0;

const kv = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // storage full / private mode: sync still works for this session
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // nothing stored
    }
  },
};

/** Before the store remembered its account, the last synced user was only kept here. */
const LAST_USER_KEY = 'questlog-sync-last-user';
const engineKey = (userId: string) => `questlog-sync:${userId}`;
/** Hero lineage this device last settled with the account's cloud hero (adopted, merged or pushed). */
const decidedKey = (userId: string) => `questlog-sync-adopted:${userId}`;
const lineage = (hero: Hero | null) => (hero ? String(hero.createdAt) : 'none');
const leavesKey = (userId: string) => `questlog-pending-leave:${userId}`;
/** Hero lineage deleted by Start over while no engine ran for this account: deleted in the cloud at the next sync. */
const heroResetKey = (userId: string) => `questlog-hero-reset:${userId}`;

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

const local: LocalAdapter = {
  get deviceId() {
    return useStore.getState().deviceId;
  },
  read(): LocalSnapshot {
    const s = useStore.getState();
    return { hero: s.hero, lists: s.lists, tasks: s.tasks, items: s.items, potions: s.potions };
  },
  write(patch: Partial<LocalSnapshot>) {
    const before = useStore.getState();
    if (!quiet) announce(partyNews(before, patch));
    useStore.setState(patch as Partial<State>);
  },
};

export interface PartyNews {
  text: string;
  /** Kept in the adventure log (completions); additions are only toasted. */
  log?: string;
  id: string;
}

/** What party members did, from an engine write: completions and additions in shared lists, by others. */
export function partyNews(before: Pick<State, 'hero' | 'lists' | 'tasks'>, patch: Partial<LocalSnapshot>): PartyNews[] {
  const me = before.hero?.name;
  if (!patch.tasks) return [];
  const out: PartyNews[] = [];
  for (const t of Object.values(patch.tasks) as Task[]) {
    const prev = before.tasks[t.id];
    const list = ((patch.lists ?? before.lists) as Record<string, TaskList>)[t.listId];
    // a list this device didn't have yet (joined here or on another device) arrives whole: not news
    if (!list?.shared || t.deleted || !before.lists[t.listId]) continue;
    // a task this device never saw is new to us, not news: only a change we watched happen is
    if (prev && t.doneFor && prev.doneFor !== t.doneFor && t.doneBy && t.doneBy !== me)
      out.push({ id: `p-${t.id}-${t.updatedAt}`, text: `${t.doneBy} completed "${t.title}" in ${list.name}`, log: `${t.doneBy} completed "${t.title}" (${list.name})` });
    else if (!prev && !t.doneFor && t.createdBy && t.createdBy !== me) out.push({ id: `a-${t.id}`, text: `${t.createdBy} added "${t.title}" to ${list.name}` });
  }
  return out;
}

function announce(news: PartyNews[]) {
  if (!news.length) return;
  // a burst (back online after a while) is one toast, not a dozen
  if (news.length > 3) fx.emit({ type: 'party', text: `${news.length} party updates while you were away` });
  else for (const n of news) fx.emit({ type: 'party', text: n.text });
  const logged = news.filter((n) => n.log);
  if (logged.length)
    useStore.setState((s) => ({
      log: [...logged.map((n, i) => ({ id: n.id, at: Date.now() + i, kind: 'party' as const, text: n.log! })).reverse(), ...s.log].slice(0, 200),
    }));
}

async function hushed<T>(fn: () => Promise<T>): Promise<T> {
  quiet++;
  try {
    return await fn();
  } finally {
    quiet--;
  }
}

function publishProfile(hero: Hero | null) {
  if (!hero || !useSync.getState().userId) return;
  clearTimeout(profileTimer);
  profileTimer = window.setTimeout(() => {
    upsertProfile(hero, heroLevel(hero).level).catch(() => undefined);
  }, 3000);
}

/** The account this device's data belongs to, if it ever synced. */
function boundAccount(): string | null {
  return useStore.getState().accountId ?? kv.get(LAST_USER_KEY);
}

const hasLiveData = (s: State) => !!s.hero || Object.values(s.lists).some((l) => !l.deleted);

/** Make an account's next sync start from scratch (full pull, hero check): its records describe other data now. */
function forgetEngineState(userId: string) {
  kv.del(engineKey(userId));
  kv.del(decidedKey(userId));
  kv.del(heroResetKey(userId));
}

function showConflict(conflict: NonNullable<SyncUi['conflict']>) {
  useSync.setState({ conflict, status: 'conflict' });
  useStore.getState().setTab('party'); // the choice blocks syncing: put it in front of the player
}

async function startEngine(userId: string) {
  stopEngine();
  const client = getClient();
  if (!client) return;

  // this device's data belongs to whichever account it last synced with
  const bound = boundAccount();
  if (bound && bound !== userId) {
    if (hasLiveData(useStore.getState())) {
      engineUser = userId;
      showConflict({ kind: 'account' });
      return; // resolveAccountSwitch() continues
    }
    // only the other account's tombstones are left (e.g. after Start over): they mean nothing here
    useStore.setState({ hero: null, lists: {}, tasks: {}, items: {}, potions: {}, activeListId: null });
    forgetEngineState(bound);
    forgetEngineState(userId);
  }

  const e = new SyncEngine(local, new SupabaseRemote(client, userId), kv, userId);
  engine = e;
  engineUser = userId;
  e.onStatus((st) => {
    if (engine !== e) return;
    useSync.setState({ status: st, lastSync: st === 'idle' ? Date.now() : useSync.getState().lastSync });
    if (st === 'idle') void flushLeaves(userId);
  });

  // a hero this device hasn't settled with the cloud yet (first sign-in, Start over, an import, a new hero)
  const decided = kv.get(decidedKey(userId));
  if (decided !== lineage(useStore.getState().hero)) {
    let cloud: Hero | null = null;
    try {
      cloud = await e.inspectRemoteHero();
    } catch {
      // couldn't look (offline / server error): sync anyway — the engine merges lineages safely —
      // but don't record a decision, so the choice is offered once the cloud is reachable
      if (engine === e) await beginSyncing(e, userId);
      return;
    }
    if (engine !== e) return; // signed out or switched account meanwhile
    const mine = useStore.getState().hero;
    // this device started over (now, or before a relaunch): that hero is deleted in the cloud, never restored
    if (cloud && (!mine || lineage(mine) !== lineage(cloud))) {
      const gone = kv.get(heroResetKey(userId)) === lineage(cloud) || (!mine && decided === lineage(cloud));
      if (gone) {
        kv.set(heroResetKey(userId), lineage(cloud));
        cloud = null;
      }
    }
    if (cloud && mine && cloud.createdAt !== mine.createdAt) {
      showConflict({ kind: 'hero', cloudName: cloud.name, cloudLevel: heroLevel(cloud).level });
      return; // resolveConflict() continues
    }
    if (cloud && !mine) {
      try {
        await hushed(() => e.adoptStrategy('cloud'));
      } catch {
        // the cloud became unreachable mid-way: sync normally, and look again on the next start
        if (engine === e) await beginSyncing(e, userId);
        return;
      }
      if (engine !== e) return;
      pickLiveList();
    }
    kv.set(decidedKey(userId), lineage(useStore.getState().hero));
  }
  await beginSyncing(e, userId);
}

/**
 * Re-key this device's own lists and tasks (ids are global: the old account's server copies keep theirs).
 * Lists it shared come along as private copies (the party stays with the old account); lists it joined
 * from others are dropped.
 */
export function rekeyOwnData(s: Pick<State, 'lists' | 'tasks' | 'activeListId'>, t: number, oldAccount: string | null, newId: () => string = uid) {
  const ids = new Map<string, string>();
  const lists: Record<string, TaskList> = {};
  for (const l of Object.values(s.lists)) {
    if (l.deleted || (l.ownerId && l.ownerId !== oldAccount)) continue;
    const id = newId();
    ids.set(l.id, id);
    const { shared: _shared, ownerId: _owner, ...rest } = l;
    lists[id] = { ...rest, id, updatedAt: t };
  }
  const tasks: Record<string, Task> = {};
  for (const tk of Object.values(s.tasks)) {
    const listId = ids.get(tk.listId);
    if (tk.deleted || !listId) continue;
    const id = newId();
    tasks[id] = { ...tk, id, listId, updatedAt: t };
  }
  const activeListId = (s.activeListId && ids.get(s.activeListId)) ?? s.activeListId;
  return { lists, tasks, activeListId };
}

/** Another account signed in on a device holding someone else's data. */
export async function resolveAccountSwitch(choice: 'fresh' | 'bring') {
  const userId = useSync.getState().userId;
  if (!userId) return;
  const prev = boundAccount();
  if (choice === 'fresh') {
    // wipe this device (no tombstones: that data belongs to the other account, not this one)
    useStore.setState({ hero: null, lists: {}, tasks: {}, items: {}, potions: {}, activeListId: null, tab: 'quests' });
  } else {
    const s = useStore.getState();
    useStore.setState({ ...rekeyOwnData(s, Date.now(), prev), items: liveOnly(s.items), potions: liveOnly(s.potions) });
    pickLiveList();
  }
  if (prev) forgetEngineState(prev);
  forgetEngineState(userId);
  useStore.setState({ accountId: userId });
  useSync.setState({ conflict: null, status: 'syncing' });
  await startEngine(userId).catch(() => failedStart());
}

/** A start that threw: show it, and let the next auth event, focus or Sync now try again. */
function failedStart() {
  stopEngine();
  useSync.setState({ status: 'error' });
}

const liveOnly = <T extends { deleted?: boolean }>(r: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => !v.deleted));

async function beginSyncing(e: SyncEngine, userId: string) {
  if (engine !== e) return;
  const firstPull = !kv.get(engineKey(userId)); // (before anything below saves engine state)
  useStore.setState({ accountId: userId });
  kv.del(LAST_USER_KEY); // superseded by the store's accountId
  for (const id of pendingLeaves(userId)) e.purgeList(id, true);
  void flushLeaves(userId);
  const reset = Number(kv.get(heroResetKey(userId)) ?? NaN);
  if (Number.isFinite(reset)) {
    e.deleteHero(reset); // the engine keeps it until the cloud has it
    kv.del(heroResetKey(userId));
  }
  unsubStore?.();
  unsubStore = useStore.subscribe((s, prev) => {
    if (s.hero !== prev.hero || s.lists !== prev.lists || s.tasks !== prev.tasks || s.items !== prev.items || s.potions !== prev.potions)
      e.notifyLocalChange();
    if (s.hero !== prev.hero) publishProfile(s.hero);
  });
  await (firstPull ? hushed(() => e.start()) : e.start());
  if (engine !== e) return;
  publishProfile(useStore.getState().hero);
  const code = useSync.getState().pendingJoin;
  if (code)
    await joinByCode(code).catch((err) => useSync.setState({ pendingJoin: null, joinError: errText(err, 'Could not join with that invite link.') }));
}

function stopEngine() {
  unsubStore?.();
  unsubStore = null;
  engine?.stop();
  engine = null;
  engineUser = null;
}

export async function resolveConflict(strategy: 'merge' | 'cloud' | 'local') {
  const userId = useSync.getState().userId;
  const e = engine;
  if (!e || !userId || engineUser !== userId) return;
  await hushed(() => e.adoptStrategy(strategy)); // throws if the cloud can't be reached: the sheet stays up
  if (engine !== e) return;
  pickLiveList();
  kv.set(decidedKey(userId), lineage(useStore.getState().hero));
  useSync.setState({ conflict: null, status: 'syncing' });
  await beginSyncing(e, userId);
}

/** After adopting cloud data the selected list may be gone. */
function pickLiveList() {
  const st = useStore.getState();
  if (st.activeListId === TODAY_ID) return;
  const cur = st.activeListId ? st.lists[st.activeListId] : undefined;
  if (cur && !cur.deleted) return;
  const first = visibleLists(st)[0];
  useStore.setState({ activeListId: first?.id ?? null });
}

export async function syncNow() {
  const { userId, conflict } = useSync.getState();
  if (!engine && userId && !conflict) return startEngine(userId).catch(() => failedStart()); // an earlier start failed
  await engine?.syncNow();
}

export async function joinByCode(code: string): Promise<string | null> {
  const clean = code.trim().toUpperCase();
  const e = engine;
  if (!e) {
    useSync.setState({ pendingJoin: clean, joinError: null });
    return null;
  }
  await flushing; // a leave being sent right now must not land after this join
  const listId = await joinList(clean);
  setPendingLeaves(engineUser ?? '', pendingLeaves(engineUser ?? '').filter((id) => id !== listId)); // rejoined
  await hushed(() => e.pullList(listId));
  useSync.setState({ pendingJoin: null, joinError: null });
  const list = useStore.getState().lists[listId];
  if (list) {
    useStore.getState().setActiveList(listId);
    useStore.getState().setTab('quests');
    fx.emit({ type: 'party', text: `You joined "${list.name}"!` });
  }
  return listId;
}

// ---------------------------------------------------------------- leaving party lists

function pendingLeaves(userId: string): string[] {
  if (!userId) return [];
  try {
    const v: unknown = JSON.parse(kv.get(leavesKey(userId)) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function setPendingLeaves(userId: string, ids: string[]) {
  if (!userId) return;
  if (ids.length) kv.set(leavesKey(userId), JSON.stringify(ids));
  else kv.del(leavesKey(userId));
}

let flushing: Promise<void> | null = null;

/** Tell the server about leaves made offline (or before this sign-in). */
function flushLeaves(userId: string): Promise<void> {
  if (flushing || !pendingLeaves(userId).length) return flushing ?? Promise.resolve();
  flushing = (async () => {
    for (const id of pendingLeaves(userId)) {
      if (engineUser !== userId) return; // signed out / switched: the next sign-in retries
      if (!pendingLeaves(userId).includes(id)) continue; // rejoined meanwhile
      try {
        await leaveList(id);
      } catch {
        continue; // offline: retried after the next successful sync
      }
      setPendingLeaves(userId, pendingLeaves(userId).filter((x) => x !== id));
      if (engineUser === userId) engine?.leaveConfirmed(id);
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** The store left a party list (Leave, Delete on a joined list, Start over): drop it here, tell the server. */
syncHooks.leave = (listId: string) => {
  const userId = boundAccount();
  if (!userId) return;
  setPendingLeaves(userId, [...new Set([...pendingLeaves(userId), listId])]);
  if (engine && engineUser === userId) {
    engine.purgeList(listId, true);
    void flushLeaves(userId);
  }
};

/** Start over dropped the hero: delete it in the cloud too (the account's engine now, or at the next sync). */
syncHooks.heroReset = (born: number) => {
  const userId = boundAccount();
  if (!userId) return;
  if (engine && engineUser === userId) engine.deleteHero(born);
  else kv.set(heroResetKey(userId), String(born));
  kv.set(decidedKey(userId), lineage(null)); // this device has settled on having no hero
};

/** Signs this device out, even offline. */
export async function signOutHere() {
  await signOut(); // throws only when the server refused (the message is shown)
  stopEngine();
  useSync.setState({ userId: null, email: null, status: 'signed-out', conflict: null });
}

/** Call once at startup. */
export function initSync() {
  // #join=CODE deep links (shared via the Party tab)
  const m = location.hash.match(/join=([A-Za-z0-9]+)/);
  if (m) {
    useSync.setState({ pendingJoin: m[1].toUpperCase(), joinError: null });
    history.replaceState(null, '', location.pathname + location.search);
    useStore.getState().setTab('party');
  }
  if (!getSyncConfig()) {
    useSync.setState({ status: 'off' });
    return;
  }
  const apply = (user: { id: string; email?: string | null } | null) => {
    if (user) {
      const changed = useSync.getState().userId !== user.id;
      useSync.setState({ userId: user.id, email: user.email ?? null });
      // token refreshes and tab focus re-announce the same user: only a new engine means a new sync
      if (changed || engineUser !== user.id) {
        useSync.setState({ status: 'syncing', conflict: null });
        startEngine(user.id).catch(() => failedStart());
      }
    } else {
      stopEngine();
      useSync.setState({ userId: null, email: null, status: 'signed-out', conflict: null });
    }
  };
  getUser()
    .then(apply)
    .catch(() => useSync.setState({ status: 'signed-out' }));
  unsubAuth?.();
  unsubAuth = onAuthChange(apply);
}

/** Re-run after the user saves new Supabase settings. */
export function restartSync() {
  stopEngine();
  unsubAuth?.();
  unsubAuth = null;
  useSync.setState({ status: getSyncConfig() ? 'signed-out' : 'off', userId: null, email: null, conflict: null });
  initSync();
}
