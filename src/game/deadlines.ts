// Time-sensitive quests: a deadline (one-off quests) or a daily "by" time / the period's end (repeating
// ones), what is at stake when it is missed ("flexible" or "must do"), and the countdown bar behind the row.
import type { Task } from '../core/types';
import { t } from '../i18n';
import { isDone, logicalDate, parseDateKey, periodKey, weekStartDate, type TimeCfg } from '../core/time';

export type Stakes = 'flexible' | 'must';

/**
 * Repeating quests the player never set stakes on count as flexible: missing them hurts a little. Only days
 * (weeks, months) that began after this release count, so nobody is hit for one that started before the
 * update could tell them.
 */
export const DEFAULT_STAKES_FROM = Date.UTC(2026, 9, 20, 18);

/** What missing the quest costs: its own choice, else flexible for repeating quests; null when nothing. */
export function stakesOf(task: Pick<Task, 'stakes' | 'repeat'>): Stakes | null {
  if (task.stakes === 'flexible' || task.stakes === 'must') return task.stakes;
  if (task.stakes === 'none') return null;
  return task.repeat.kind === 'none' ? null : 'flexible';
}

/**
 * What missing the window that `at` falls in costs. A repeating quest without stakes of its own only counts
 * from the periods that began after the default came in (DEFAULT_STAKES_FROM).
 */
export function stakesAt(task: Task, at: number, cfg: TimeCfg): Stakes | null {
  const s = stakesOf(task);
  if (!s || task.stakes || task.repeat.kind === 'none') return s;
  return (periodWindow(task, at, cfg)?.start ?? 0) < DEFAULT_STAKES_FROM ? null : s;
}

const DAY = 86_400_000;
/** One-off quests: warn this long before the deadline. */
export const WARN_MS = 3 * 3600_000;

/** Ms of "HH:MM" after midnight, or null. */
export function parseByTime(v: string | undefined): number | null {
  const m = typeof v === 'string' ? v.match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? (h * 60 + min) * 60_000 : null;
}

/** A "done by" time only means something for quests that come back every (chosen) day. */
export function byTimeOf(task: Task): number | null {
  return task.repeat.kind === 'daily' || task.repeat.kind === 'days' ? parseByTime(task.byTime) : null;
}

/** When a one-off quest is due: its exact deadline, or else the end of its due date's (logical) day. */
export function deadlineOf(task: Task, cfg: TimeCfg): number | null {
  if (typeof task.deadline === 'number' && Number.isFinite(task.deadline)) return task.deadline;
  if (typeof task.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(task.due)) return null;
  const d = parseDateKey(task.due);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() + cfg.dayStartHour * 3600_000;
}

/**
 * The time window a quest has to be done in right now: up to its due date (one-off quests), its "done by"
 * time (daily ones that have one), or the end of its day, week or month (other repeating ones).
 * Null for one-off quests with no due date.
 */
export function windowOf(task: Task, now: number, cfg: TimeCfg): { start: number; end: number } | null {
  if (task.repeat.kind === 'none') {
    const end = deadlineOf(task, cfg);
    if (end === null) return null;
    const start = Math.min(task.deadlineSetAt ?? task.createdAt, end - 60_000);
    return { start, end };
  }
  const by = byTimeOf(task);
  const day = logicalDate(now, cfg);
  const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  if (by !== null) {
    // "every day by 10:00": the window is the logical day up to that time (it may already be over)
    const start = midnight + cfg.dayStartHour * 3600_000;
    const end = midnight + by + (by < cfg.dayStartHour * 3600_000 ? DAY : 0);
    // the player asked for more time today
    const ext = task.extendFor;
    if (ext && ext.key === periodKey(task.repeat, now, cfg) && ext.until > end) return { start, end: ext.until };
    return { start, end };
  }
  return periodWindow(task, now, cfg);
}

/** The end of the logical day `now` is in. */
export function dayEnd(now: number, cfg: TimeCfg): number {
  const d = logicalDate(now, cfg);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() + cfg.dayStartHour * 3600_000;
}

/** A time limit the player set on purpose (not just the end of a repeating quest's day or week). */
export function hasLimit(task: Task, cfg: TimeCfg): boolean {
  return task.repeat.kind === 'none' ? deadlineOf(task, cfg) !== null : stakesOf(task) !== null || byTimeOf(task) !== null;
}

/** The whole current repeat period, from its first to its last moment. */
function periodWindow(task: Task, now: number, cfg: TimeCfg): { start: number; end: number } | null {
  const r = task.repeat;
  const d = logicalDate(now, cfg);
  const shift = cfg.dayStartHour * 3600_000;
  let first: Date;
  let next: Date;
  switch (r.kind) {
    case 'daily':
    case 'days':
      first = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      break;
    case 'weekly':
      first = weekStartDate(d, cfg.weekStart);
      next = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7);
      break;
    case 'monthly':
      first = new Date(d.getFullYear(), d.getMonth(), 1);
      next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      break;
    case 'interval': {
      const n = Math.max(1, r.every);
      const a = parseDateKey(r.anchor);
      const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const days = Math.round((today.getTime() - a.getTime()) / DAY);
      const k = Math.floor(days / n);
      first = new Date(a.getFullYear(), a.getMonth(), a.getDate() + k * n);
      next = new Date(a.getFullYear(), a.getMonth(), a.getDate() + (k + 1) * n);
      break;
    }
    default:
      return null;
  }
  return { start: first.getTime() + shift, end: next.getTime() + shift };
}

/** How much of the window is left, 0..1 (for the bar), or null. */
export function timeLeft(task: Task, now: number, cfg: TimeCfg): number | null {
  const w = windowOf(task, now, cfg);
  if (!w || isDone(task, now, cfg)) return null;
  return Math.max(0, Math.min(1, (w.end - now) / Math.max(1, w.end - w.start)));
}

/** "2h 10m left", "time is up", for row labels, in the player's language. */
export function leftLabel(task: Task, now: number, cfg: TimeCfg): string | null {
  const w = windowOf(task, now, cfg);
  if (!w || isDone(task, now, cfg)) return null;
  const ms = w.end - now;
  if (ms <= 0) return t('time is up');
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return t('{m}m left', { m });
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? t('{h}h {m}m left', { h, m: m % 60 }) : t('{h}h left', { h });
  return t('{d}d left', { d: Math.floor(h / 24) });
}

/**
 * A repeating quest with stakes whose last window ended without it being done, and which hasn't been
 * counted yet: that window's period key and end, or null. One-off quests are asked about (see askDue).
 */
export function missedAt(task: Task, now: number, cfg: TimeCfg): { key: string; end: number } | null {
  if (task.deleted || task.repeat.kind === 'none' || !stakesOf(task)) return null;
  const from = task.createdAt;
  // without stakes of its own, a period that began before the default came in doesn't count
  const tooEarly = (at: number) => !stakesAt(task, at, cfg);
  // windows up to the last counted one are settled (older saves only remember its key)
  const counted = (key: string, end: number) => (task.missedEnd !== undefined ? end <= task.missedEnd : task.missedFor === key);
  const by = byTimeOf(task);
  if (by !== null) {
    const today = windowOf(task, now, cfg)!;
    let at: number; // a moment inside the window that most recently ended
    let end: number;
    if (now >= today.end) {
      at = now;
      end = today.end;
    } else {
      // today's window is still open, so yesterday's was the last (more time only ever applies to today)
      at = now - DAY;
      end = windowOf({ ...task, extendFor: null }, now, cfg)!.end - DAY;
    }
    const key = periodKey(task.repeat, at, cfg);
    if (from >= end || tooEarly(at) || counted(key, end)) return null;
    const doneInTime = task.doneFor === key && (task.doneAt ?? 0) <= end;
    return doneInTime || !activeOn(task, at, cfg) ? null : { key, end };
  }
  const w = periodWindow(task, now, cfg);
  if (!w) return null;
  const at = w.start - 1; // the previous period
  const key = periodKey(task.repeat, at, cfg);
  if (from >= w.start || tooEarly(at) || counted(key, w.start) || task.doneFor === key) return null;
  // a weekly quest done last week has doneFor = last week's key until it is done again; the check above
  // covers it. Days a 'some days' quest is off are not misses.
  return activeOn(task, at, cfg) ? { key, end: w.start } : null;
}

/** The period key of missedAt, or null. */
export function missedWindow(task: Task, now: number, cfg: TimeCfg): string | null {
  return missedAt(task, now, cfg)?.key ?? null;
}

/** Is a repeating quest on for the logical day `at` is in ("some days" quests are off on the others)? */
export function activeOn(task: Task, at: number, cfg: TimeCfg): boolean {
  const r = task.repeat;
  if (r.kind === 'days') return r.days.includes(logicalDate(at, cfg).getDay());
  return true;
}

/** The soonest moment after `now` when one of these quests' time runs out, or null (to wake up right then). */
export function nextDeadline(tasks: Task[], now: number, cfg: TimeCfg): number | null {
  let best: number | null = null;
  for (const task of tasks) {
    if (task.deleted || !hasLimit(task, cfg)) continue;
    const w = windowOf(task, now, cfg);
    if (w && w.end > now && (best === null || w.end < best)) best = w.end;
  }
  return best;
}

/** A closed "what happened?" question comes back after this long. */
export const SNOOZE_MS = 3600_000;
/** Nobody answered: a miss counts this long after the time ran out. */
export const AUTO_MISS_MS = 24 * 3600_000;

const snoozed = (task: Task, now: number) => !!task.askedAt && now - task.askedAt < SNOOZE_MS;

/** One-off quest past its due time, not done and not answered: time to ask "what happened?". */
export function askDue(task: Task, now: number, cfg: TimeCfg): boolean {
  if (task.deleted || task.repeat.kind !== 'none' || task.doneFor) return false;
  const end = deadlineOf(task, cfg);
  if (end === null || now < end) return false;
  if (task.deadlineOutcome) return false;
  return !snoozed(task, now);
}

/** A quest the player should say something about now: an overdue one-off, or a repeating quest's miss. */
export function needsAnswer(task: Task, now: number, cfg: TimeCfg): boolean {
  if (task.deleted) return false;
  if (task.repeat.kind === 'none') return askDue(task, now, cfg);
  return !!task.pendingMiss && !snoozed(task, now);
}

/** What the player can say about a missed window. */
export type MissAnswer = 'done' | 'missed' | 'cancel' | { more: number };

/** Gold an answer costs: the full penalty for a miss; a must-do also pays half for more time or for calling it off. */
export function answerCost(task: Task, answer: MissAnswer, gold: number, level: number): number {
  const stakes = stakesOf(task);
  if (!stakes || answer === 'done') return 0;
  const full = missPenalty(gold, stakes, (task.misses ?? 0) + 1, level);
  if (answer === 'missed') return full;
  return stakes === 'must' ? Math.round(full / 2) : 0;
}

/**
 * Gold an answer gives back when the hero already took the hit for this miss (repeating quests): all of it
 * for "I did it", all of it for flexible quests skipped or given more time, half for must-dos; none for
 * "I missed it". Null when nothing was taken yet (one-off quests are asked before anything is taken).
 */
export function refundFor(task: Task, answer: MissAnswer): number | null {
  const p = task.pendingMiss;
  if (!p || p.paid === undefined) return null;
  if (answer === 'missed') return 0;
  if (answer === 'done') return p.paid;
  return stakesOf(task) === 'must' ? p.paid - Math.round(p.paid / 2) : p.paid;
}

/**
 * How much more time the player can ask for (ms options). One-off quests: an hour, three, or a day.
 * Repeating quests with a "done by" time: more time today only, while today lasts. Other repeating quests
 * are already into their next period, so there is nothing to extend.
 */
export function moreTimeOptions(task: Task, now: number, cfg: TimeCfg): number[] {
  if (task.repeat.kind === 'none') return [3600_000, 3 * 3600_000, DAY];
  const p = task.pendingMiss;
  if (!p || byTimeOf(task) === null || p.key !== periodKey(task.repeat, now, cfg)) return [];
  const left = dayEnd(now, cfg) - now;
  const opts = [3600_000, 3 * 3600_000].filter((ms) => ms < left - 15 * 60_000);
  // "the rest of today", when that's more than the bigger option
  if (left > 15 * 60_000 && !opts.includes(left)) opts.push(left - 60_000);
  return opts;
}

/** Gold lost for a miss: must-do quests hurt more, and every miss in a row hurts more than the last. */
export function missPenalty(gold: number, stakes: Stakes, streak: number, level: number): number {
  const base = stakes === 'must' ? 0.08 : 0.03;
  const grow = 1 + Math.min(streak - 1, 5) * 0.5;
  const floor = stakes === 'must' ? 5 + level : 1 + Math.floor(level / 3);
  return Math.max(0, Math.min(gold, Math.round(Math.max(floor, gold * base) * grow)));
}
