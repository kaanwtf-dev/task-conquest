// App-side wiring for cloud sync: store <-> SyncEngine adapter, auth lifecycle, party join links.
import { create } from 'zustand';
import type { Hero } from '../core/types';
import { useStore, visibleLists } from './store';
import { fx } from './fx';
import { heroLevel } from '../game/progression';
import { getClient, getSyncConfig, getUser, onAuthChange } from '../sync/supabase';
import { SyncEngine } from '../sync/engine';
import { SupabaseRemote } from '../sync/supabase';
import { joinList, upsertProfile } from '../sync/party';
import type { LocalAdapter, LocalSnapshot } from '../sync/types';

export type SyncStatus = 'off' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error';

interface SyncUi {
  status: SyncStatus;
  email: string | null;
  userId: string | null;
  /** Set on a device's first sign-in when the cloud already has a different hero. */
  /**
   * 'hero': first sign-in on this device while the cloud holds a different hero.
   * 'account': this device last synced with ANOTHER account — never push its data into this one silently.
   */
  conflict: { kind: 'hero'; cloudName: string; cloudLevel: number } | { kind: 'account' } | null;
  pendingJoin: string | null;
  lastSync: number | null;
}

export const useSync = create<SyncUi>(() => ({
  status: getSyncConfig() ? 'signed-out' : 'off',
  email: null,
  userId: null,
  conflict: null,
  pendingJoin: null,
  lastSync: null,
}));

let engine: SyncEngine | null = null;
let unsubStore: (() => void) | null = null;
let profileTimer: number | undefined;

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
};

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
    announceRemote(before, patch);
    useStore.setState(patch as Partial<ReturnType<typeof useStore.getState>>);
  },
};

/** Toast when a party member completes or adds something in a shared list. */
function announceRemote(before: ReturnType<typeof useStore.getState>, patch: Partial<LocalSnapshot>) {
  const me = before.hero?.name;
  if (!patch.tasks) return;
  for (const t of Object.values(patch.tasks)) {
    const prev = before.tasks[t.id];
    const list = (patch.lists ?? before.lists)[t.listId];
    if (!list?.shared) continue;
    if (t.doneFor && prev?.doneFor !== t.doneFor && t.doneBy && t.doneBy !== me) {
      fx.emit({ type: 'party', text: `${t.doneBy} completed "${t.title}" in ${list.name}` });
      useStore.setState((s) => ({ log: [{ id: `p-${t.id}-${t.updatedAt}`, at: Date.now(), kind: 'party' as const, text: `${t.doneBy} completed "${t.title}" (${list.name})` }, ...s.log].slice(0, 200) }));
    } else if (!prev && t.createdBy && t.createdBy !== me) {
      fx.emit({ type: 'party', text: `${t.createdBy} added "${t.title}" to ${list.name}` });
    }
  }
}

function publishProfile(hero: Hero | null) {
  if (!hero || !useSync.getState().userId) return;
  clearTimeout(profileTimer);
  profileTimer = window.setTimeout(() => {
    upsertProfile(hero, heroLevel(hero).level).catch(() => undefined);
  }, 3000);
}

async function startEngine(userId: string) {
  stopEngine();
  const client = getClient();
  if (!client) return;
  engine = new SyncEngine(local, new SupabaseRemote(client, userId), kv, userId);
  engine.onStatus((st) => useSync.setState({ status: st, lastSync: st === 'idle' ? Date.now() : useSync.getState().lastSync }));

  // this device's data belongs to whichever account it last synced with
  const lastUser = kv.get(LAST_USER_KEY);
  const st = useStore.getState();
  const hasLocal = !!st.hero || Object.values(st.lists).some((l) => !l.deleted);
  if (lastUser && lastUser !== userId && hasLocal) {
    useSync.setState({ conflict: { kind: 'account' } });
    return; // resolveAccountSwitch() continues
  }

  // first sign-in on this device while the cloud already holds a different hero -> let the player choose
  const firstKey = `questlog-sync-adopted:${userId}`;
  if (!kv.get(firstKey)) {
    let cloud: Hero | null = null;
    try {
      cloud = await engine.inspectRemoteHero();
    } catch {
      // couldn't look (offline / server error): sync anyway — the engine merges lineages safely —
      // but don't mark this device as decided, so the choice is offered once the cloud is reachable
      await beginSyncing(userId);
      return;
    }
    const mine = useStore.getState().hero;
    if (cloud && mine && cloud.createdAt !== mine.createdAt) {
      useSync.setState({ conflict: { kind: 'hero', cloudName: cloud.name, cloudLevel: heroLevel(cloud).level } });
      return; // resolveConflict() continues
    }
    if (cloud && !mine) {
      await engine.adoptStrategy('cloud');
      pickLiveList();
    }
    kv.set(firstKey, '1');
  }
  await beginSyncing(userId);
}

const LAST_USER_KEY = 'questlog-sync-last-user';

/** Another account signed in on a device holding someone else's data. */
export async function resolveAccountSwitch(choice: 'fresh' | 'bring') {
  const userId = useSync.getState().userId;
  if (!userId) return;
  if (choice === 'fresh') {
    // wipe this device (no tombstones: that data belongs to the other account, not this one)
    useStore.setState({ hero: null, lists: {}, tasks: {}, items: {}, potions: {}, activeListId: null, tab: 'quests' });
  }
  kv.set(LAST_USER_KEY, userId);
  useSync.setState({ conflict: null });
  await startEngine(userId);
}

async function beginSyncing(userId: string) {
  if (!engine) return;
  kv.set(LAST_USER_KEY, userId);
  await engine.start();
  unsubStore = useStore.subscribe((s, prev) => {
    if (s.hero !== prev.hero || s.lists !== prev.lists || s.tasks !== prev.tasks || s.items !== prev.items || s.potions !== prev.potions)
      engine?.notifyLocalChange();
    if (s.hero !== prev.hero) publishProfile(s.hero);
  });
  publishProfile(useStore.getState().hero);
  const code = useSync.getState().pendingJoin;
  if (code) await joinByCode(code).catch(() => undefined);
}

function stopEngine() {
  unsubStore?.();
  unsubStore = null;
  engine?.stop();
  engine = null;
}

export async function resolveConflict(strategy: 'merge' | 'cloud' | 'local') {
  const userId = useSync.getState().userId;
  if (!engine || !userId) return;
  await engine.adoptStrategy(strategy);
  pickLiveList();
  kv.set(`questlog-sync-adopted:${userId}`, '1');
  useSync.setState({ conflict: null });
  await beginSyncing(userId);
}

/** After adopting cloud data the selected list may be gone. */
function pickLiveList() {
  const st = useStore.getState();
  const cur = st.activeListId ? st.lists[st.activeListId] : undefined;
  if (cur && !cur.deleted) return;
  const first = visibleLists(st)[0];
  useStore.setState({ activeListId: first?.id ?? null });
}

export async function syncNow() {
  await engine?.syncNow();
}

export async function joinByCode(code: string): Promise<string | null> {
  const clean = code.trim().toUpperCase();
  if (!engine) {
    useSync.setState({ pendingJoin: clean });
    return null;
  }
  const listId = await joinList(clean);
  await engine.pullList(listId);
  useSync.setState({ pendingJoin: null });
  const list = useStore.getState().lists[listId];
  if (list) {
    useStore.getState().updateList(listId, { shared: true });
    useStore.getState().setActiveList(listId);
    fx.emit({ type: 'party', text: `You joined "${list.name}"!` });
  }
  return listId;
}

export function afterLeave(listId: string) {
  engine?.purgeList(listId);
}

/** Call once at startup. */
export function initSync() {
  // #join=CODE deep links (shared via the Party tab)
  const m = location.hash.match(/join=([A-Za-z0-9]+)/);
  if (m) {
    useSync.setState({ pendingJoin: m[1].toUpperCase() });
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
      useSync.setState({ userId: user.id, email: user.email ?? null, status: 'syncing' });
      if (changed || !engine) startEngine(user.id).catch(() => useSync.setState({ status: 'error' }));
    } else {
      stopEngine();
      useSync.setState({ userId: null, email: null, status: 'signed-out', conflict: null });
    }
  };
  getUser()
    .then(apply)
    .catch(() => useSync.setState({ status: 'signed-out' }));
  onAuthChange(apply);
}

/** Re-run after the user saves new Supabase settings. */
export function restartSync() {
  stopEngine();
  useSync.setState({ status: getSyncConfig() ? 'signed-out' : 'off', userId: null, email: null });
  initSync();
}
