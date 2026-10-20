// The scheduled reminder sender's logic; supabase/functions/reminders wires it to the cloud and the push services.
// For each device with reminders on: is it one of that player's reminder hours (in their own time zone),
// and does their save give the reminder something worth saying? Then it goes out, once per slot per day.
// Nothing here logs player data: function logs are kept by the hosting service.
import type { Hero, Task, TaskList } from '../core/types';
import { locale, setLang, t } from '../i18n';
import { fromRow } from '../sync/engine';
import type { RemoteRow } from '../sync/types';
import {
  DEFAULT_PUSH_PREFS,
  NUDGE_KINDS,
  PARTY_GAP_MS,
  afterSlot,
  partyDigest,
  partyHours,
  pickNudge,
  slotAt,
  type Nudge,
  type NudgeKind,
  type NudgeState,
  type PushHistory,
  type PushPrefs,
} from './nudges';

export interface SubRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  tz: string;
  prefs: unknown;
  history: unknown;
  /** when the app last re-saved it (every launch): a device unseen for long is gone or abandoned */
  updated_at?: string;
}

/** A deadline notification the app scheduled (push_alarms), ready to send. */
export interface AlarmRow {
  user_id: string;
  key: string;
  fire_at: string;
  title: string;
  body: string;
  tag: string;
}

export interface Cloud {
  subscriptions(): Promise<SubRow[]>;
  /** The devices of these players. */
  subscriptionsOf(userIds: string[]): Promise<SubRow[]>;
  /** Alarms due by `now`, taken off the table (so two runs never send one twice); `peek` leaves them there. */
  takeAlarms(now: number, peek: boolean): Promise<AlarmRow[]>;
  /** What the last run wrote (to know whether this signing key has ever been accepted). */
  lastStats(): Promise<Partial<RunStats> | null>;
  /** The player's own live docs, plus the live docs of the party lists they belong to. */
  docs(userId: string): Promise<RemoteRow[]>;
  saveHistory(endpoint: string, history: PushHistory): Promise<void>;
  forget(endpoint: string): Promise<void>;
  heartbeat(stats: RunStats): Promise<void>;
}

/** 'gone': the device dropped the subscription; 'config': the push service refused our keys (fix the setup). */
export type SendResult = 'ok' | 'gone' | 'config' | 'retry';
export type Sender = (sub: SubRow, payload: string, opts: { ttl: number; topic: string }) => Promise<SendResult>;

export type Mode = 'run' | 'dry-run' | 'test' | 'alarms';
export interface RunStats {
  devices: number;
  due: number;
  sent: number;
  gone: number;
  failed: number;
  config: number;
  /** the public signing key a push service has accepted (once one has) */
  keyOk?: string;
  /** true when the run stopped early to stay inside the job's time limit */
  cut?: boolean;
}

/** The push services browsers use. The sender only ever posts to these (the table accepts no others either). */
export const PUSH_ENDPOINT = /^https:\/\/(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
/** A morning reminder for a phone that was off all day is stale by evening. */
export const TTL_SECONDS = 3 * 3600;
/**
 * Devices whose app has not been opened for this long are dropped: Apple keeps accepting pushes for an app
 * deleted from the Home Screen, so a dead subscription can look alive forever.
 */
export const STALE_MS = 60 * 86_400_000;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const intIn = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : dflt;

/** Reminder settings as the device saved them, with anything malformed back at its default. */
export function sanitizePrefs(v: unknown): PushPrefs {
  const p = isObj(v) ? v : {};
  return {
    morningHour: intIn(p.morningHour, 0, 23, DEFAULT_PUSH_PREFS.morningHour),
    eveningHour: intIn(p.eveningHour, 0, 23, DEFAULT_PUSH_PREFS.eveningHour),
    off: Array.isArray(p.off) ? NUDGE_KINDS.filter((k) => (p.off as unknown[]).includes(k)) : [],
    dayStartHour: intIn(p.dayStartHour, 0, 23, DEFAULT_PUSH_PREFS.dayStartHour),
    weekStart: intIn(p.weekStart, 0, 6, DEFAULT_PUSH_PREFS.weekStart),
    lang: p.lang === 'tr' ? 'tr' : 'en',
  };
}

export function sanitizeHistory(v: unknown): PushHistory {
  const h = isObj(v) ? v : {};
  const sent = isObj(h.sent) ? h.sent : {};
  const day = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined);
  return {
    sent: { ...(day(sent.morning) ? { morning: day(sent.morning) } : {}), ...(day(sent.evening) ? { evening: day(sent.evening) } : {}) },
    comebacks: intIn(h.comebacks, 0, 1000, 0),
    ...(typeof h.partyAt === 'number' && Number.isFinite(h.partyAt) ? { partyAt: h.partyAt } : {}),
    ...(Array.isArray(h.warned) ? { warned: h.warned.filter((x): x is string => typeof x === 'string' && x.length <= 80).slice(-30) } : {}),
  };
}

/** An IANA time zone this runtime knows, or UTC. */
export function validZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** The player's save as the app would see it after syncing: hero, lists and tasks (others are not needed). */
export function stateFromRows(rows: RemoteRow[], userId: string): NudgeState {
  const state: NudgeState = { hero: null, lists: {}, tasks: {} };
  // a save is written by its player's devices, so anything in it may be malformed: never trust its shape
  const days = (v: unknown) => (Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : []);
  for (const row of rows) {
    if (row.deleted) continue;
    const m = fromRow(row, userId);
    if (!m || m.doc.deleted) continue;
    if (m.kind === 'hero') {
      const h = m.doc as Hero;
      state.hero = { ...h, name: typeof h.name === 'string' ? h.name : 'adventurer', activeDays: days(h.activeDays), savedDays: days(h.savedDays) };
    }
    else if (m.kind === 'list') state.lists[m.doc.id] = m.doc as TaskList;
    else if (m.kind === 'task') state.tasks[m.doc.id] = m.doc as Task;
  }
  return state;
}

/**
 * The push message: Declarative Web Push (iOS 18.4+ and Safari show it themselves, without running the
 * service worker, so it can never count as a silent push), which public/push-sw.js also reads on older
 * systems and other browsers. WebKit reads app_badge from the top level only.
 */
export function payload(n: Pick<Nudge, 'title' | 'body' | 'tag'> & { badge?: number }, appUrl: string): string {
  // push services refuse anything over 4 KB (encrypted): keep well inside it whatever players named things
  const clip = (s: string, max: number) => ([...String(s)].length > max ? `${[...String(s)].slice(0, max - 1).join('')}…` : String(s));
  return JSON.stringify({
    web_push: 8030,
    notification: { title: clip(n.title, 120), body: clip(n.body, 400), navigate: appUrl, tag: n.tag, lang: locale(), dir: 'ltr' },
    // no badge: leave the icon as it is (a test message must not wipe everyone's count)
    ...(n.badge === undefined ? {} : { app_badge: Math.max(0, Math.min(999, Math.round(Number(n.badge) || 0))) }),
  });
}

/** What "Run workflow › test" sends to every device: proof the whole chain works, right now. */
export function testNudge(state: NudgeState): Omit<Nudge, 'badge'> & { badge?: number } {
  const name = state.hero?.name ?? t('adventurer');
  return { kind: 'plan', title: t('🔔 Test reminder'), body: t('Hello {name}! Reminders from Task Conquest reach this device.', { name }), tag: 'taskconquest-test' };
}

export async function runReminders(opts: {
  cloud: Cloud;
  send: Sender;
  now: number;
  mode: Mode;
  appUrl: string;
  /** the public signing key: once a push service accepted it, a refusal means that one device is bad */
  key: string;
  /** puts the process in the player's time zone, so the app's day logic reads their local time */
  setZone: (tz: string) => void;
  /** stop starting new sends after this (the heartbeat must still be written inside the job's limit) */
  deadline?: number;
  clock?: () => number;
}): Promise<RunStats> {
  const { cloud, send, now, mode, appUrl, setZone, key } = opts;
  const clock = opts.clock ?? Date.now;
  const stats: RunStats = { devices: 0, due: 0, sent: 0, gone: 0, failed: 0, config: 0 };
  const proven = (await cloud.lastStats().catch(() => null))?.keyOk === key;
  const saves = new Map<string, Promise<NudgeState>>();
  const saveOf = (userId: string) => {
    let s = saves.get(userId);
    if (!s) saves.set(userId, (s = cloud.docs(userId).then((rows) => stateFromRows(rows, userId))));
    return s;
  };
  // devices whose push service refused our signing key: either this one subscription was made for another
  // key (it can never work: drop it), or, when nothing at all got through, the key itself is wrong
  const refused: SubRow[] = [];

  try {
    const subs = await cloud.subscriptions();
    stats.devices = subs.length;
    for (const sub of subs) {
      if (opts.deadline !== undefined && clock() > opts.deadline) {
        stats.cut = true;
        break;
      }
      try {
        await device(sub);
      } catch {
        stats.failed++; // one broken save or a cloud hiccup must not cost everyone else their reminder
      }
    }
    // the key works if anything got through, now or in an earlier run: then each refusal is that device's
    // own problem (made for another key) and it goes; if nothing has ever got through, the key is suspect
    if (stats.sent > 0 || proven) {
      stats.keyOk = key;
      for (const sub of refused) {
        stats.gone++;
        await cloud.forget(sub.endpoint).catch(() => undefined);
      }
    } else stats.config = refused.length;
  } finally {
    setLang('en');
    if (mode !== 'dry-run') await cloud.heartbeat(stats).catch(() => undefined);
  }
  return stats;

  async function device(sub: SubRow): Promise<void> {
    if (!PUSH_ENDPOINT.test(sub.endpoint)) {
      stats.failed++;
      return;
    }
    const seen = sub.updated_at ? Date.parse(sub.updated_at) : NaN;
    if (mode === 'run' && now - seen > STALE_MS) {
      stats.gone++;
      await cloud.forget(sub.endpoint);
      return;
    }
    setZone(validZone(sub.tz));
    const prefs = sanitizePrefs(sub.prefs);
    setLang(prefs.lang ?? 'en'); // the reminder is written in the player's language
    const history = sanitizeHistory(sub.history);
    let nudge: (Omit<Nudge, 'badge'> & { badge?: number }) | null;
    let topic: string;
    if (mode === 'test') {
      const state = await saveOf(sub.user_id);
      setLang(prefs.lang ?? 'en'); // another device's turn may have run while the save loaded
      nudge = testNudge(state);
      topic = 'test';
    } else {
      const slot = slotAt(now, prefs);
      const partyOn = !prefs.off.includes('party') && partyHours(now, prefs) && now - (history.partyAt ?? 0) >= PARTY_GAP_MS;
      // deadline warnings and misses go out as alarms (runAlarms), on the minute
      if (!slot && !partyOn) return;
      const state = await saveOf(sub.user_id);
      setZone(validZone(sub.tz)); // another device's turn may have run while the save loaded
      setLang(prefs.lang ?? 'en');
      let next = history;
      nudge = null;
      topic = slot ?? 'party';
      if (slot) {
        const picked = pickNudge(state, now, slot, prefs, history);
        nudge = picked;
        next = afterSlot(history, state, now, slot, prefs, picked);
      }
      if (!nudge && partyOn) {
        // what the party did since the last digest (a new device starts with the last hour)
        const digest = partyDigest(state, history.partyAt ?? now - PARTY_GAP_MS, now);
        next = { ...next, partyAt: now };
        if (digest) {
          nudge = { kind: 'party', ...digest };
          topic = 'party';
        }
      }
      // the slot is claimed before sending: a send that fails is a missed reminder, never a doubled one
      if (mode === 'run' && JSON.stringify(next) !== JSON.stringify(history)) await cloud.saveHistory(sub.endpoint, next);
    }
    if (!nudge) return;
    stats.due++;
    if (mode === 'dry-run') return;
    const r = await send(sub, payload(nudge, appUrl), { ttl: mode === 'test' ? 600 : TTL_SECONDS, topic });
    if (r === 'ok') stats.sent++;
    else if (r === 'gone') {
      stats.gone++;
      await cloud.forget(sub.endpoint);
    } else if (r === 'config') refused.push(sub);
    else stats.failed++;
  }
}

/** An alarm the job couldn't send for this long (it was down) is stale news: dropped. */
export const ALARM_STALE_MS = 2 * 3600_000;

/** A short push "topic" per quest (letters and digits only), so a phone that was off gets the latest per quest. */
function topicOf(tag: string): string {
  let h = 2166136261;
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 16777619);
  return `a${(h >>> 0).toString(36)}`;
}

/**
 * Sends the deadline alarms that are due (written by the players' apps, already in their words) to each
 * player's devices that have deadline notifications on. Reads no saves: it runs every minute.
 */
export async function runAlarms(opts: { cloud: Cloud; send: Sender; now: number; appUrl: string; peek?: boolean }): Promise<RunStats> {
  const { cloud, send, now, appUrl, peek = false } = opts;
  const stats: RunStats = { devices: 0, due: 0, sent: 0, gone: 0, failed: 0, config: 0 };
  const due = (await cloud.takeAlarms(now, peek)).filter((a) => now - Date.parse(a.fire_at) <= ALARM_STALE_MS);
  if (!due.length) return stats;
  const subs = await cloud.subscriptionsOf([...new Set(due.map((a) => a.user_id))]);
  stats.devices = subs.length;
  const dropped = new Set<string>();
  try {
    for (const alarm of due) {
      for (const sub of subs) {
        if (sub.user_id !== alarm.user_id || dropped.has(sub.endpoint) || !PUSH_ENDPOINT.test(sub.endpoint)) continue;
        const prefs = sanitizePrefs(sub.prefs);
        if (prefs.off.includes('deadline')) continue;
        stats.due++;
        if (peek) continue;
        setLang(prefs.lang ?? 'en'); // marks the message with the player's language
        const r = await send(sub, payload({ title: alarm.title, body: alarm.body, tag: alarm.tag }, appUrl), { ttl: ALARM_STALE_MS / 1000, topic: topicOf(alarm.tag) });
        if (r === 'ok') stats.sent++;
        else if (r === 'gone') {
          stats.gone++;
          dropped.add(sub.endpoint);
          await cloud.forget(sub.endpoint).catch(() => undefined);
        } else if (r === 'config') stats.config++;
        else stats.failed++;
      }
    }
  } finally {
    setLang('en');
  }
  return stats;
}

export type { NudgeKind };
