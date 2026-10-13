// Supabase connection: config (build-time env or entered in the app), email+password auth, and the
// RemoteAdapter over the `docs` table (supabase/schema.sql).
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { SyncOfflineError } from './types';
import type { PushResult, RemoteAdapter, RemoteRow } from './types';

export interface SyncConfig {
  url: string;
  anonKey: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

const CONFIG_KEY = 'questlog-supabase';
const AUTH_STORAGE_KEY = 'questlog-auth';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // access can throw in sandboxed / private contexts
  }
}

const cleanUrl = (u: string) => u.trim().replace(/\/+$/, '');

function envConfig(): SyncConfig | null {
  const env = import.meta.env as Record<string, unknown> | undefined;
  const url = typeof env?.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const anonKey = typeof env?.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY.trim() : '';
  return url && anonKey ? { url: cleanUrl(url), anonKey } : null;
}

/** Build-time env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) wins; otherwise what the user entered. */
export function getSyncConfig(): SyncConfig | null {
  const env = envConfig();
  if (env) return env;
  try {
    const raw = storage()?.getItem(CONFIG_KEY);
    const c = raw ? (JSON.parse(raw) as Partial<SyncConfig>) : null;
    if (!c || typeof c.url !== 'string' || typeof c.anonKey !== 'string' || !c.url.trim() || !c.anonKey.trim()) return null;
    return { url: cleanUrl(c.url), anonKey: c.anonKey.trim() };
  } catch {
    return null;
  }
}

export function setSyncConfig(cfg: SyncConfig | null): void {
  try {
    if (cfg) storage()?.setItem(CONFIG_KEY, JSON.stringify({ url: cleanUrl(cfg.url), anonKey: cfg.anonKey.trim() }));
    else storage()?.removeItem(CONFIG_KEY);
  } catch {
    // storage unavailable: nothing to persist
  }
}

let cached: { key: string; client: SupabaseClient } | null = null;

/** One client per config (null when sync is not configured). */
export function getClient(): SupabaseClient | null {
  const cfg = getSyncConfig();
  if (!cfg) return null;
  const key = `${cfg.url}\n${cfg.anonKey}`;
  if (cached?.key !== key) {
    if (cached) {
      void cached.client.auth.stopAutoRefresh();
      void cached.client.removeAllChannels();
    }
    cached = {
      key,
      client: createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY },
      }),
    };
  }
  return cached.client;
}

function need(): SupabaseClient {
  const c = getClient();
  if (!c) throw new Error('Cloud sync is not set up yet.');
  return c;
}

const toUser = (u: User): AuthUser => ({ id: u.id, email: u.email ?? null });

function authMessage(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first (check your inbox), then sign in.';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Could not reach the cloud. Check your connection.';
  return msg;
}

/** Email + password (magic links would open Safari instead of the home-screen app). */
export async function signUp(email: string, password: string): Promise<{ user: AuthUser | null; needsConfirmation: boolean }> {
  const { data, error } = await need().auth.signUp({ email, password });
  if (error) throw new Error(authMessage(error.message));
  return { user: data.user ? toUser(data.user) : null, needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await need().auth.signInWithPassword({ email, password });
  if (error) throw new Error(authMessage(error.message));
  return toUser(data.user);
}

/** Signs out this device only (works offline). */
export async function signOut(): Promise<void> {
  const c = getClient();
  if (!c) return;
  const { error } = await c.auth.signOut({ scope: 'local' });
  if (error) throw new Error(authMessage(error.message));
}

/** The signed-in user from the stored session (no network needed). */
export async function getUser(): Promise<AuthUser | null> {
  const c = getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session ? toUser(data.session.user) : null;
}

export function onAuthChange(cb: (user: AuthUser | null) => void): () => void {
  const c = getClient();
  if (!c) return () => undefined;
  const { data } = c.auth.onAuthStateChange((_event, session) => {
    // deferred: calling Supabase inside this callback can deadlock on the auth lock
    setTimeout(() => cb(session ? toUser(session.user) : null), 0);
  });
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------- RemoteAdapter

/** A request the server answered with an error (not a connectivity problem). */
export class RemoteError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'RemoteError';
    this.code = code;
  }
}

interface ErrLike {
  message: string;
  code?: string;
}

const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** postgrest-js reports a failed fetch as status 0. */
export function toRemoteError(error: ErrLike, status: number): Error {
  if (status === 0 || offlineNow()) return new SyncOfflineError(error.message);
  return new RemoteError(error.message, error.code ?? '');
}

function check<T>(res: { data: T | null; error: ErrLike | null; status: number }): T {
  if (res.error) throw toRemoteError(res.error, res.status);
  return res.data as T;
}

// Errors that concern the rows themselves (row-level security, constraint / data errors); anything else,
// e.g. "permission denied for table" from an expired session, fails the whole push and is retried.
function rowError(e: ErrLike): boolean {
  if (e.code === '42501') return /row-level security/i.test(e.message);
  return ['23502', '23503', '23514', '22001', '22003', '22007', '22008', '22P02', '22P05'].includes(e.code ?? '');
}

const COLS = 'id,kind,list_id,data,updated_at,deleted,owner,server_ts';
const PAGE = 1000;
const OVERLAP_MS = 5000;
const CHUNK = 500;

function normRow(r: RemoteRow): RemoteRow {
  return { ...r, list_id: r.list_id ?? null, updated_at: Number(r.updated_at), deleted: !!r.deleted };
}

let channelSeq = 0;

export class SupabaseRemote implements RemoteAdapter {
  private readonly client: SupabaseClient;
  private readonly userId: string;

  constructor(client: SupabaseClient, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  /**
   * Pages of 1000 by (server_ts, id), starting 5s before the cursor: a row stamped just before the cursor
   * may commit after it was taken. Rows can repeat; the engine's merge is idempotent.
   */
  async pull(sinceIso: string | null): Promise<RemoteRow[]> {
    const out: RemoteRow[] = [];
    const seen = new Set<string>();
    const take = (rows: RemoteRow[]) => {
      for (const r of rows) {
        const k = `${r.id}@${r.server_ts}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(normRow(r));
      }
    };
    let since: string | null = null;
    if (sinceIso) {
      const t = Date.parse(sinceIso);
      since = Number.isFinite(t) ? new Date(t - OVERLAP_MS).toISOString() : null;
    }
    let strict = false;
    for (;;) {
      let q = this.client.from('docs').select(COLS);
      if (since) q = strict ? q.gt('server_ts', since) : q.gte('server_ts', since);
      const rows = check<RemoteRow[]>(await q.order('server_ts', { ascending: true }).order('id', { ascending: true }).limit(PAGE)) ?? [];
      take(rows);
      if (rows.length < PAGE) return out;
      const last = rows[rows.length - 1].server_ts ?? null;
      if (!last) return out;
      if (last === since) {
        // a whole page shares one timestamp: drain that instant by offset, then move strictly past it
        for (let from = PAGE; ; from += PAGE) {
          const more =
            check<RemoteRow[]>(await this.client.from('docs').select(COLS).eq('server_ts', last).order('id', { ascending: true }).range(from, from + PAGE - 1)) ?? [];
          take(more);
          if (more.length < PAGE) break;
        }
        strict = true;
      } else strict = false;
      since = last;
    }
  }

  async pullList(listId: string): Promise<RemoteRow[]> {
    const out: RemoteRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const rows =
        check<RemoteRow[]>(await this.client.from('docs').select(COLS).eq('list_id', listId).order('id', { ascending: true }).range(from, from + PAGE - 1)) ?? [];
      out.push(...rows.map(normRow));
      if (rows.length < PAGE) return out;
    }
  }

  async pullDoc(id: string): Promise<RemoteRow | null> {
    const row = check<RemoteRow | null>(await this.client.from('docs').select(COLS).eq('id', id).maybeSingle());
    return row ? normRow(row) : null;
  }

  async memberships(): Promise<string[]> {
    const rows = check<{ list_id: string }[]>(await this.client.from('list_members').select('list_id').eq('user_id', this.userId)) ?? [];
    return rows.map((r) => r.list_id);
  }

  /** Lists go first (their insert creates the owner membership that tasks are checked against). */
  async push(rows: RemoteRow[]): Promise<PushResult> {
    const rejected: string[] = [];
    if (!rows.length) return { rejected };
    const { data } = await this.client.auth.getSession();
    // without a session the request would run as anon: never mistake that for per-row refusals
    if (!data.session) throw new RemoteError('Not signed in', 'auth');
    for (const group of [rows.filter((r) => r.kind === 'list'), rows.filter((r) => r.kind !== 'list')]) {
      for (let i = 0; i < group.length; i += CHUNK) await this.upsert(group.slice(i, i + CHUNK), rejected);
    }
    return { rejected };
  }

  private async upsert(rows: RemoteRow[], rejected: string[]): Promise<void> {
    if (!rows.length) return;
    const body = rows.map(({ id, kind, list_id, data, updated_at, deleted }) => ({ id, kind, list_id, data, updated_at, deleted }));
    const { error, status } = await this.client.from('docs').upsert(body, { onConflict: 'id' });
    if (!error) return;
    if (status === 0 || !rowError(error)) throw toRemoteError(error, status);
    if (rows.length === 1) {
      rejected.push(rows[0].id);
      return;
    }
    // bisect to isolate the refused rows; the rest still go through
    const mid = rows.length >> 1;
    await this.upsert(rows.slice(0, mid), rejected);
    await this.upsert(rows.slice(mid), rejected);
  }

  subscribe(onRow: (row: RemoteRow) => void, onMembership?: () => void): () => void {
    const ch = this.client
      .channel(`questlog-${this.userId}-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (p) => {
        if (p.eventType === 'DELETE') return;
        const row = p.new as RemoteRow | undefined;
        if (row && typeof row.id === 'string') onRow(normRow(row));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_members' }, () => onMembership?.())
      .subscribe();
    return () => {
      void this.client.removeChannel(ch);
    };
  }
}
