// What a reminder notification says, if anything: picked from the player's own synced save at a given
// moment. Pure (no DOM, no store) so the scheduled sender and the tests share it. Times are read in the
// process's local time zone, like the app; the sender sets it to each player's zone before calling.
import type { Hero, Task, TaskList } from '../core/types';
import { dateKey, parseDateKey, streak, todayKey, type TimeCfg } from '../core/time';
import { bossProgress } from '../game/bosses';
import { todaySections, todayRemaining } from '../state/today';

export type Slot = 'morning' | 'evening';
/** What a player can switch off, one by one. */
export type NudgeKind = 'plan' | 'evening' | 'comeback' | 'party';
export const NUDGE_KINDS: NudgeKind[] = ['plan', 'evening', 'comeback', 'party'];

export interface PushPrefs {
  /** Local hours the morning and evening reminders go out (0-23). */
  morningHour: number;
  eveningHour: number;
  /** Kinds switched off (all on by default). */
  off: NudgeKind[];
  dayStartHour: number;
  weekStart: number;
}
export const DEFAULT_PUSH_PREFS: PushPrefs = { morningHour: 9, eveningHour: 20, off: [], dayStartHour: 0, weekStart: 1 };

/** What the sender remembers per device, so nobody hears the same thing twice. */
export interface PushHistory {
  /** slot -> the logical day it last went out */
  sent?: Partial<Record<Slot, string>>;
  /** comeback reminders sent during the current absence (they stop after a few) */
  comebacks?: number;
}

export interface Nudge {
  kind: 'plan' | 'streak' | 'party' | 'dailies' | 'boss' | 'comeback';
  title: string;
  body: string;
  /** replaces an older notification with the same tag instead of piling up */
  tag: string;
  /** quests left today, for the app icon badge */
  badge: number;
}

export interface NudgeState {
  hero: Hero | null;
  lists: Record<string, TaskList>;
  tasks: Record<string, Task>;
}

/** How long the player's slot stays open: a scheduler that runs late (or skips a run) still delivers. */
const SLOT_HOURS = 2;
/** Comebacks: after this many idle days, at most this many reminders until they play again. */
const IDLE_DAYS = 2;
const MAX_COMEBACKS = 3;

/** Which reminder slot `now` falls in for these prefs, if any. */
export function slotAt(now: number, prefs: PushPrefs): Slot | null {
  const h = new Date(now).getHours();
  const within = (start: number) => (h - start + 24) % 24 < SLOT_HOURS;
  if (within(prefs.eveningHour)) return 'evening';
  if (within(prefs.morningHour)) return 'morning';
  return null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Player-written text (quest titles, hero names) shortened to fit a notification line. */
const clip = (s: unknown, max: number) => {
  const chars = [...String(s ?? '')];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};

/** Days between two day keys (b - a). */
function daysBetween(a: string, b: string): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86_400_000);
}

/**
 * The reminder for this slot, or null when there is nothing worth saying (or it already went out today).
 * Morning: a comeback nudge after a few idle days, else today's plan. Evening, in order: a streak about
 * to end, a party member who got things done today while you didn't, dailies left, a boss nearly down.
 */
export function pickNudge(state: NudgeState, now: number, slot: Slot, prefs: PushPrefs, history: PushHistory = {}): Nudge | null {
  const hero = state.hero;
  if (!hero) return null;
  const cfg: TimeCfg = { dayStartHour: prefs.dayStartHour, weekStart: prefs.weekStart };
  const today = todayKey(now, cfg);
  if (history.sent?.[slot] === today) return null;
  const on = (k: NudgeKind) => !prefs.off.includes(k);

  const lists = new Map(Object.values(state.lists).filter((l) => !l.deleted).map((l) => [l.id, l]));
  const live = Object.values(state.tasks).filter((t) => !t.deleted && lists.has(t.listId));
  // the same "what's left today" as the app's Today view and its badge (groceries never count)
  const s = todaySections(state.lists, state.tasks, now, cfg);
  const left = [...s.overdue, ...s.dueToday, ...s.routine];
  const badge = todayRemaining(s);

  const days = [...hero.activeDays, ...(hero.savedDays ?? [])];
  const playedToday = days.includes(today);
  const lastDay = days.reduce((a, d) => (d > a ? d : a), '');
  const idle = lastDay ? daysBetween(lastDay, today) : Infinity;
  const name = clip(hero.name, 24); // for display; comparisons use hero.name

  if (slot === 'morning') {
    if (on('comeback') && idle >= IDLE_DAYS && idle !== Infinity && (history.comebacks ?? 0) < MAX_COMEBACKS) {
      const { boss } = bossProgress(hero);
      return {
        kind: 'comeback',
        title: '🛡️ Your hero is getting rusty',
        body: `${plural(idle, 'day')} without a quest, ${name}. ${boss.name} grows bolder. One small one to warm up?`,
        tag: 'questlog-comeback',
        badge,
      };
    }
    if (!on('plan') || !left.length) return null;
    const { boss, hp } = bossProgress(hero);
    const named = left
      .slice()
      .sort((a, b) => b.difficulty - a.difficulty)
      .slice(0, 2)
      .map((t) => clip(t.title, 48));
    const more = left.length > named.length ? ` +${left.length - named.length} more` : '';
    return {
      kind: 'plan',
      title: `⚔️ ${plural(left.length, 'quest')} today`,
      body: `${named.join(', ')}${more}. ${boss.name} has ${hp.toLocaleString('en-US')} HP left.`,
      tag: 'questlog-plan',
      badge,
    };
  }

  if (!on('evening') && !on('party')) return null;
  const run = streak(days, now, cfg);
  if (on('evening') && !playedToday && run >= 2) {
    return {
      kind: 'streak',
      title: `🔥 Your ${run}-day streak is on the line`,
      body: `Finish one quest before the day resets to keep it alive${left.length ? ` (${plural(left.length, 'quest')} waiting)` : ''}.`,
      tag: 'questlog-evening',
      badge,
    };
  }

  if (on('party') && !playedToday) {
    // what the rest of the party finished today on shared lists
    const byWho = new Map<string, number>();
    for (const t of live) {
      const l = lists.get(t.listId)!;
      if (!l.shared || !t.doneBy || t.doneBy === hero.name || !t.doneAt) continue;
      if (todayKey(t.doneAt, cfg) !== today) continue;
      byWho.set(t.doneBy, (byWho.get(t.doneBy) ?? 0) + 1);
    }
    const top = [...byWho.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      return {
        kind: 'party',
        title: `👀 ${clip(top[0], 24)} finished ${plural(top[1], 'quest')} today`,
        body: `Your move, ${name}.${left.length ? ` ${plural(left.length, 'quest')} left for you.` : ''}`,
        tag: 'questlog-evening',
        badge,
      };
    }
  }

  if (!on('evening') || !left.length) return null;
  // the routine ones reset tonight: those are worth a nudge
  const dailies = s.routine;
  if (playedToday && dailies.length) {
    return {
      kind: 'dailies',
      title: `🌙 ${plural(dailies.length, 'daily quest')} left`,
      body: `${clip(dailies[0].title, 48)}${dailies.length > 1 ? ` and ${plural(dailies.length - 1, 'other')}` : ''} reset when the day ends.`,
      tag: 'questlog-evening',
      badge,
    };
  }
  const { boss, hp } = bossProgress(hero);
  if (hp > 0 && hp <= boss.maxHp * 0.15) {
    return {
      kind: 'boss',
      title: `💀 ${boss.name} is down to ${hp.toLocaleString('en-US')} HP`,
      body: 'One more quest could finish it off.',
      tag: 'questlog-evening',
      badge,
    };
  }
  return null;
}

/** The history after `nudge` went out at `now` (and after a quiet slot, the comeback count resets once played). */
export function afterSlot(history: PushHistory, state: NudgeState, now: number, slot: Slot, prefs: PushPrefs, nudge: Nudge | null): PushHistory {
  const cfg: TimeCfg = { dayStartHour: prefs.dayStartHour, weekStart: prefs.weekStart };
  const today = todayKey(now, cfg);
  const days = state.hero ? [...state.hero.activeDays, ...(state.hero.savedDays ?? [])] : [];
  const y = parseDateKey(today);
  y.setDate(y.getDate() - 1); // calendar arithmetic: a day is not always 24 hours
  const yesterday = dateKey(y);
  // playing again (today or yesterday) starts a fresh absence count
  const played = days.includes(today) || days.includes(yesterday);
  return {
    sent: nudge ? { ...history.sent, [slot]: today } : history.sent,
    comebacks: nudge?.kind === 'comeback' ? (history.comebacks ?? 0) + 1 : played ? 0 : history.comebacks ?? 0,
  };
}
