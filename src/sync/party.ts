// Party lists: invite codes/links, joining and leaving, the member roster and public hero cards.
import type { ClassId, Hero } from '../core/types';
import type { Appearance } from '../pixel/sprites/hero';
import { flushSync } from './engine';
import { getClient, toRemoteError } from './supabase';

export interface PartyMember {
  userId: string;
  role: string;
  name: string;
  level: number;
  appearance?: Appearance;
  classId?: ClassId;
  title?: string;
}

interface RpcResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
  status: number;
}

function client() {
  const c = getClient();
  if (!c) throw new Error('Cloud sync is not set up yet.');
  return c;
}

/** Codes are 6 chars from an unambiguous alphabet; accept lower case, spaces and dashes. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function inviteUrl(code: string): string {
  const env = import.meta.env as Record<string, unknown> | undefined;
  const base = typeof env?.BASE_URL === 'string' ? env.BASE_URL : '/';
  const origin = typeof location !== 'undefined' && location.origin && location.origin !== 'null' ? location.origin : '';
  return `${origin}${base}#join=${code}`;
}

function friendly(res: RpcResult<unknown>): Error {
  const e = res.error!;
  const err = toRemoteError(e, res.status);
  if (err.name === 'SyncOfflineError') return new Error('You are offline. Try again when connected.');
  if (/invalid invite code/i.test(e.message)) return new Error('That invite code does not exist.');
  if (/not a member/i.test(e.message)) return new Error('This list is not in the cloud yet. Try again in a moment.');
  if (/sign in first/i.test(e.message)) return new Error('Sign in first.');
  return err;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  return (await client().rpc(fn, args)) as RpcResult<T>;
}

export async function createInvite(listId: string): Promise<{ code: string; url: string }> {
  let res = await rpc<string>('create_invite', { p_list_id: listId });
  if (res.error && /not a member/i.test(res.error.message)) {
    await flushSync(); // a brand-new list may exist only on this device so far
    res = await rpc<string>('create_invite', { p_list_id: listId });
  }
  if (res.error || typeof res.data !== 'string') throw friendly(res.error ? res : { ...res, error: { message: 'No invite code returned' } });
  return { code: res.data, url: inviteUrl(res.data) };
}

/** Returns the joined list id; follow with SyncEngine.pullList(listId). */
export async function joinList(code: string): Promise<string> {
  const clean = normalizeCode(code);
  if (clean.length < 4) throw new Error('That invite code does not exist.');
  const res = await rpc<string>('join_list', { p_code: clean });
  if (res.error || typeof res.data !== 'string') throw friendly(res.error ? res : { ...res, error: { message: 'invalid invite code' } });
  return res.data;
}

/** Follow with SyncEngine.purgeList(listId). */
export async function leaveList(listId: string): Promise<void> {
  const res = await rpc<null>('leave_list', { p_list_id: listId });
  if (res.error) throw friendly(res);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function toMember(r: { user_id: string; role: string; name: string | null; data: unknown }): PartyMember {
  const d = isObj(r.data) ? r.data : {};
  const level = Number(d.level);
  return {
    userId: r.user_id,
    role: r.role,
    name: r.name?.trim() || 'Adventurer',
    level: Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1,
    appearance: isObj(d.appearance) ? (d.appearance as unknown as Appearance) : undefined,
    classId: typeof d.classId === 'string' ? (d.classId as ClassId) : undefined,
    title: typeof d.title === 'string' ? d.title : undefined,
  };
}

export async function listParty(listId: string): Promise<PartyMember[]> {
  const res = await rpc<{ user_id: string; role: string; name: string | null; data: unknown }[]>('list_party', { p_list_id: listId });
  if (res.error) throw friendly(res);
  return (res.data ?? []).map(toMember);
}

/** Publish the hero card party members see (name, look, class, level, title). */
export async function upsertProfile(hero: Hero, level: number): Promise<void> {
  const c = client();
  const { data } = await c.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;
  const res = (await c.from('profiles').upsert(
    {
      user_id: userId,
      name: hero.name,
      data: { appearance: hero.appearance, classId: hero.classId, level, title: hero.title ?? null },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )) as RpcResult<null>;
  if (res.error) throw friendly(res);
}
