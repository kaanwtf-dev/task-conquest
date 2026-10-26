// "Remind me at": times of day a quest should be brought up, with a notification, without being a deadline.
// Before the day's first reminder the quest stays out of Today; from then on it waits at the top, flashing,
// until it is done (or snoozed for a bit).
import type { Task } from '../core/types';
import { isActiveToday, isDone, logicalDate, todayKey, type TimeCfg } from '../core/time';
import { parseByTime } from './deadlines';

export const MAX_REMINDERS = 3;
export const SNOOZE_REMINDER_MS = 15 * 60_000;
const DAY = 86_400_000;

/** The quest's reminder times (ms after midnight), valid ones only, soonest first. */
export function reminderTimes(task: Pick<Task, 'remindAt'>): number[] {
  const list = Array.isArray(task.remindAt) ? task.remindAt : [];
  return [...new Set(list.map(parseByTime).filter((x): x is number => x !== null))].sort((a, b) => a - b).slice(0, MAX_REMINDERS);
}

/** The reminder moments of the logical day `at` falls in (a time before the day start belongs to its end). */
export function remindersOn(task: Pick<Task, 'remindAt'>, at: number, cfg: TimeCfg): number[] {
  const d = logicalDate(at, cfg);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const start = cfg.dayStartHour * 3600_000;
  return reminderTimes(task)
    .map((ms) => midnight + ms + (ms < start ? DAY : 0))
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
  if (task.deleted || !reminderTimes(task).length || !askedOn(task, now, cfg) || isDone(task, now, cfg)) return 'none';
  if (task.repeat.kind === 'none' && task.doneFor) return 'none';
  if (typeof task.snoozedUntil === 'number' && task.snoozedUntil > now) return 'later';
  const [first] = remindersOn(task, now, cfg);
  return now < first ? 'later' : 'due';
}

/** Every reminder moment from `now` up to `until`, on the days the quest is asked for and not yet done. */
export function upcomingReminders(task: Task, now: number, until: number, cfg: TimeCfg): number[] {
  if (task.deleted || !reminderTimes(task).length) return [];
  if (task.repeat.kind === 'none' && task.doneFor) return [];
  const out: number[] = [];
  for (let probe = now; probe < until + DAY; probe += DAY) {
    if (!askedOn(task, probe, cfg) || isDone(task, probe, cfg)) continue;
    for (const at of remindersOn(task, probe, cfg)) if (at > now && at < until && !out.includes(at)) out.push(at);
  }
  if (typeof task.snoozedUntil === 'number' && task.snoozedUntil > now && task.snoozedUntil < until && !isDone(task, now, cfg) && !out.includes(task.snoozedUntil))
    out.push(task.snoozedUntil);
  return out.sort((a, b) => a - b);
}
