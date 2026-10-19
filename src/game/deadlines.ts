// Time-sensitive quests: a deadline (one-off quests) or a daily "by" time / the period's end (repeating
// ones), what is at stake when it is missed ("flexible" or "must do"), and the countdown bar behind the row.
import type { Task } from '../core/types';
import { isDone, logicalDate, parseDateKey, periodKey, weekStartDate, type TimeCfg } from '../core/time';

export type Stakes = 'flexible' | 'must';

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

/** The time window a quest has to be done in right now, or null for quests with no time limit. */
export function windowOf(task: Task, now: number, cfg: TimeCfg): { start: number; end: number } | null {
  if (task.repeat.kind === 'none') {
    if (!task.deadline) return null;
    const start = Math.min(task.deadlineSetAt ?? task.createdAt, task.deadline - 60_000);
    return { start, end: task.deadline };
  }
  const by = byTimeOf(task);
  if (!task.stakes && by === null) return null;
  const day = logicalDate(now, cfg);
  const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  if (by !== null) {
    // "every day by 10:00": the window is the logical day up to that time (it may already be over)
    const start = midnight + cfg.dayStartHour * 3600_000;
    return { start, end: midnight + by + (by < cfg.dayStartHour * 3600_000 ? DAY : 0) };
  }
  return periodWindow(task, now, cfg);
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

/** "2h 10m left", "late", for row labels. */
export function leftLabel(task: Task, now: number, cfg: TimeCfg): string | null {
  const w = windowOf(task, now, cfg);
  if (!w || isDone(task, now, cfg)) return null;
  const ms = w.end - now;
  if (ms <= 0) return 'time is up';
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m left` : `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}

/**
 * A repeating quest with stakes whose last window ended without it being done: the period key of that
 * window (to remember it was counted), or null. One-off quests are asked about instead (see askDue).
 */
export function missedWindow(task: Task, now: number, cfg: TimeCfg): string | null {
  if (task.deleted || task.repeat.kind === 'none' || !task.stakes) return null;
  const by = byTimeOf(task);
  let at: number; // a moment inside the window that most recently ended
  if (by !== null) {
    const w = windowOf(task, now, cfg)!;
    at = now >= w.end ? now : now - DAY; // today's window is over, or else yesterday's was the last
    const key = periodKey(task.repeat, at, cfg);
    const end = now >= w.end ? w.end : w.end - DAY;
    if (task.createdAt >= end || task.missedFor === key) return null;
    const doneInTime = task.doneFor === key && (task.doneAt ?? 0) <= end;
    return doneInTime || !activeOn(task, at, cfg) ? null : key;
  }
  const w = windowOf(task, now, cfg);
  if (!w) return null;
  at = w.start - 1; // the previous period
  const key = periodKey(task.repeat, at, cfg);
  if (task.createdAt >= w.start || task.missedFor === key || task.doneFor === key) return null;
  // a weekly quest done last week has doneFor = last week's key until it is done again; the check above
  // covers it. Days a 'some days' quest is off are not misses.
  return activeOn(task, at, cfg) ? key : null;
}

function activeOn(task: Task, at: number, cfg: TimeCfg): boolean {
  const r = task.repeat;
  if (r.kind === 'days') return r.days.includes(logicalDate(at, cfg).getDay());
  return true;
}

/** One-off quest past its deadline, not done and not asked about lately: time to ask "did you do it?". */
export function askDue(task: Task, now: number): boolean {
  if (task.deleted || task.repeat.kind !== 'none' || !task.deadline || task.doneFor) return false;
  if (now < task.deadline) return false;
  if (task.deadlineOutcome) return false;
  return !task.askedAt || now - task.askedAt > 12 * 3600_000;
}

/** Gold lost for a miss: must-do quests hurt more, and every miss in a row hurts more than the last. */
export function missPenalty(gold: number, stakes: Stakes, streak: number, level: number): number {
  const base = stakes === 'must' ? 0.08 : 0.03;
  const grow = 1 + Math.min(streak - 1, 5) * 0.5;
  const floor = stakes === 'must' ? 5 + level : 1 + Math.floor(level / 3);
  return Math.max(0, Math.min(gold, Math.round(Math.max(floor, gold * base) * grow)));
}
