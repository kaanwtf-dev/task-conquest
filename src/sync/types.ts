// Contracts between the sync engine, the local store and the cloud backend.
import type { Hero, Item, PotionStack, Task, TaskList } from '../core/types';

/** The synced part of local state. */
export interface LocalSnapshot {
  hero: Hero | null;
  lists: Record<string, TaskList>;
  tasks: Record<string, Task>;
  items: Record<string, Item>;
  potions: Record<string, PotionStack>;
}

/**
 * Bridge to the store. `write` replaces every collection present in the patch wholesale (the engine
 * always passes complete records built from a fresh `read()`), and leaves the others untouched.
 */
export interface LocalAdapter {
  read(): LocalSnapshot;
  write(patch: Partial<LocalSnapshot>): void;
  readonly deviceId: string;
}

/** Small persistent string store (localStorage in the app, a Map in tests). */
export interface KeyValue {
  get(k: string): string | null;
  set(k: string, v: string): void;
}

export type DocKind = 'hero' | 'list' | 'task' | 'item' | 'potion';

/** One row of the `docs` table (supabase/schema.sql). `owner` and `server_ts` are set by the server only. */
export interface RemoteRow {
  id: string;
  kind: DocKind;
  list_id: string | null;
  data: Record<string, unknown>;
  updated_at: number;
  deleted: boolean;
  owner?: string;
  server_ts?: string;
}

export interface PushResult {
  /** Row ids the server refused for good (permissions / invalid data); the engine does not retry them. */
  rejected: string[];
}

export interface RemoteAdapter {
  /** Every visible row changed since `sinceIso` (all rows when null), oldest first. May repeat rows. */
  pull(sinceIso: string | null): Promise<RemoteRow[]>;
  /** Every row of one list (used right after joining it). */
  pullList(listId: string): Promise<RemoteRow[]>;
  pullDoc(id: string): Promise<RemoteRow | null>;
  /** Ids of all lists the user is a member of. */
  memberships(): Promise<string[]>;
  /** Upsert rows (never sending owner/server_ts); older rows lose to newer server copies silently. */
  push(rows: RemoteRow[]): Promise<PushResult>;
  /** Live changes; `onMembership` fires when list memberships change. Returns an unsubscribe. */
  subscribe(onRow: (row: RemoteRow) => void, onMembership?: () => void): () => void;
}

export type EngineStatus = 'idle' | 'syncing' | 'offline' | 'error';

/** First sign-in on a device whose hero differs from the cloud's. */
export type AdoptStrategy = 'merge' | 'cloud' | 'local';

/** Thrown by remotes when the network is unreachable (status becomes 'offline', not 'error'). */
export class SyncOfflineError extends Error {
  constructor(message = 'offline') {
    super(message);
    this.name = 'SyncOfflineError';
  }
}
