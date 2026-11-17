// "Remind me at": times of day a quest should be brought up, with a notification, without being a deadline.
// Before the day's first reminder the quest stays out of Today; from then on it waits at the top, flashing,
// until it is done (or snoozed for a bit).
import type { Task } from '../core/types';
import { isActiveToday, isDone, logicalDate, todayKey, type TimeCfg } from '../core/time';
import { deadlineOf, parseByTime } from './deadlines';

export const MAX_REMINDERS = 3;
export const SNOOZE_REMINDER_MS = 15 * 60_000;
const DAY = 86_400_000;

/** The quest's reminder times (ms after midnight), valid ones only, soonest first. */
export function reminderTimes(task: Pick<Task, 'remindAt'>): number[] {
  const list = Array.isArray(task.remindAt) ? task.remindAt : [];
  return [...new Set(list.map(parseByTime).filter((x): x is number => x !== null))].sort((a, b) => a - b).slice(0, MAX_REMINDERS);
}

/** "2026-11-20T20:00" (a reminder on a date, for a quest with a deadline) as a local time, or null. */
export function parseDated(v: string): number | null {
  const m = typeof v === 'string' ? v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * The moments of the dated reminders of a one-off quest with a deadline: only ones before the deadline count
 * (soonest first). Repeating quests and quests without a deadline have none.
 */
export function datedReminders(task: Task, cfg: TimeCfg): number[] {
  if (task.repeat.kind !== 'none' || !Array.isArray(task.remindAt)) return [];
  const end = deadlineOf(task, cfg);
  if (end === null) return [];
  return [...new Set(task.remindAt.map(parseDated).filter((x): x is number => x !== null && x < end))].sort((a, b) => a - b).slice(0, MAX_REMINDERS);
}

/** Does the quest have any reminder (a time of day, or a date and time)? */
export function hasReminders(task: Task, cfg: TimeCfg): boolean {
  return reminderTimes(task).length > 0 || datedReminders(task, cfg).length > 0;
}

/** A one-off quest whose deadline has passed and that is still not done: it stays on top, flashing, until ticked. */
export function pastDeadline(task: Task, now: number, cfg: TimeCfg): boolean {
  if (task.deleted || task.repeat.kind !== 'none' || task.doneFor) return false;
  const end = deadlineOf(task, cfg);
  return end !== null && now >= end;
}

/** The reminder moments of the logical day `at` falls in (a time before the day start belongs to its end). */
export function remindersOn(task: Pick<Task, 'remindAt'>, at: number, cfg: TimeCfg): number[] {
  const d = logicalDate(at, cfg);
  const start = cfg.dayStartHour * 3600_000;
  // by the clock on the wall, also on the days summer time starts or ends
  return reminderTimes(task)
    .map((ms) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + (ms < start ? 1 : 0), 0, 0, 0, ms).getTime())
    .sort((a, b) => a - b);
}

/** Is the quest asked for on the logical day `at` falls in (one-offs: on their due date, or every day until done)? */
function askedOn(task: Task, at: number, cfg: TimeCfg): boolean {
  if (task.repeat.kind === 'none') return !task.due || task.due === todayKey(at, cfg);
  return isActiveToday(task, at, cfg);
}

/**
 * Where a quest with reminders stands now: 'later' (today's first reminder is still ahead, or it is snoozed:
 * keep it out of Today), 'due' (time for it: at the top, flashing), or 'none' (no reminder today, or done).
 */
export function reminderState(task: Task, now: number, cfg: TimeCfg): 'none' | 'later' | 'due' {
  if (task.deleted || isDone(task, now, cfg)) return 'none';
  if (task.repeat.kind === 'none' && task.doneFor) return 'none';
  // time's up and not ticked: on top, flashing, until it is (snoozing still hides it for a bit)
  const late = pastDeadline(task, now, cfg);
  if (!late && !hasReminders(task, cfg)) return 'none';
  if (typeof task.snoozedUntil === 'number' && task.snoozedUntil > now) return 'later';
  if (late) return 'due';
  // dated reminders: from the first one on, until done
  const dated = datedReminders(task, cfg);
  if (dated.length && now >= dated[0]) return 'due';
  if (!reminderTimes(task).length || !askedOn(task, now, cfg)) return dated.length ? 'later' : 'none';
  const [first] = remindersOn(task, now, cfg);
  return now < first ? 'later' : 'due';
}

/** Every reminder moment from `now` up to `until`, on the days the quest is asked for and not yet done. */
export function upcomingReminders(task: Task, now: number, until: number, cfg: TimeCfg): number[] {
  if (task.deleted || !hasReminders(task, cfg)) return [];
  if (task.repeat.kind === 'none' && task.doneFor) return [];
  const out: number[] = datedReminders(task, cfg).filter((at) => at > now && at < until);
  for (let probe = now; probe < until + DAY; probe += DAY) {
    if (!askedOn(task, probe, cfg) || isDone(task, probe, cfg)) continue;
    for (const at of remindersOn(task, probe, cfg)) if (at > now && at < until && !out.includes(at)) out.push(at);
  }
  if (typeof task.snoozedUntil === 'number' && task.snoozedUntil > now && task.snoozedUntil < until && !isDone(task, now, cfg) && !out.includes(task.snoozedUntil))
    out.push(task.snoozedUntil);
  return out.sort((a, b) => a - b);
}
