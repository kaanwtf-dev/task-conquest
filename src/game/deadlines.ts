// Time-sensitive quests: a deadline (one-off quests) or a daily "by" time / the period's end (repeating
// ones), what is at stake when it is missed ("flexible" or "must do"), and the countdown bar behind the row.
import type { Repeat, Task, TaskList } from '../core/types';
import { canon } from '../sync/merge';
import { t } from '../i18n';
import { isDone, logicalDate, parseDateKey, periodKey, weekStartDate, type TimeCfg } from '../core/time';

export type Stakes = 'flexible' | 'must';

/**
 * Repeating quests the player never set stakes on count as flexible: missing them hurts a little. Only days
 * (weeks, months) that began after this release count, so nobody is hit for one that started before the
 * update could tell them.
 */
export const DEFAULT_STAKES_FROM = Date.UTC(2026, 9, 20, 18);

/** How many periods a quest's doneLog keeps: plenty for the period just ended to be checked. */
export const DONE_LOG_SIZE = 16;

/** Period keys in time order ("2026-10-09" < "2026-10-10", "i…:9" < "i…:10"). */
const byPeriod = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/**
 * The newest DONE_LOG_SIZE periods of a doneLog, in time order: every device trims a log the same way, so
 * two copies that have heard of the same periods hold the very same log.
 */
export function trimLog(log: Record<string, number>): Record<string, number> {
  const keys = Object.keys(log).filter((k) => k !== '__proto__' && Number.isFinite(log[k]) && log[k] !== 0).sort(byPeriod);
  return Object.fromEntries(keys.slice(-DONE_LOG_SIZE).map((k) => [k, log[k]]));
}

/**
 * The quest's doneLog once it is ticked off for `key` at `at`, keeping the completion this tick replaces in
 * doneFor (saves from before doneLog only had that one).
 */
export function loggedDone(task: Task, key: string, at: number): Record<string, number> {
  const log = { ...(task.doneLog ?? {}) };
  if (task.doneFor && task.doneFor !== 'once' && task.doneFor !== key && log[task.doneFor] === undefined && typeof task.doneAt === 'number')
    log[task.doneFor] = task.doneAt;
  log[key] = at;
  return trimLog(log);
}

/** The quest's doneLog once the tick for `key` is taken back at `at` (remembered, so no copy brings it back). */
export function loggedUndone(task: Task, key: string, at: number): Record<string, number> {
  return trimLog({ ...(task.doneLog ?? {}), [key]: -at });
}

/** Two copies' doneLogs as one: per period, the newer change wins (a tick, or taking it back). */
export function mergeLogs(a: Record<string, number> | undefined, b: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) {
    if (!Number.isFinite(v) || v === 0) continue;
    const cur = out[k];
    if (cur === undefined || Math.abs(v) > Math.abs(cur) || (Math.abs(v) === Math.abs(cur) && v > cur)) out[k] = v;
  }
  return trimLog(out);
}

const sameLog = (a: Record<string, number> | undefined, b: Record<string, number> | undefined) =>
  JSON.stringify(trimLog(a ?? {})) === JSON.stringify(trimLog(b ?? {}));

/**
 * A task is otherwise last-write-wins as a whole, so a newer edit made without knowing of a completion (on a
 * device that hadn't synced yet: a tick elsewhere, a "missed" charge, a restored backup) would erase it.
 * The winner keeps the loser's completion when that one is newer than any the winner knows of, and both
 * copies' doneLogs merge per period (newest change wins), so a tick on one device never wipes out a period
 * done, or taken back, on another. Null: nothing to add.
 */
export function keepCompletion(winner: Task, loser: Task): Task | null {
  if (loser.deleted || winner.deleted) return null;
  let out: Task = winner;
  if (loser.doneFor && typeof loser.doneAt === 'number' && !(typeof winner.doneAt === 'number' && winner.doneAt >= loser.doneAt))
    out = {
      ...out,
      doneFor: loser.doneFor,
      doneAt: loser.doneAt,
      doneBy: loser.doneBy,
      rewardedFor: loser.rewardedFor,
      timesDone: Math.max(winner.timesDone ?? 0, loser.timesDone ?? 0),
    };
  // a log kept under another schedule (the repeat was changed on one copy) means other periods: not merged
  const sameRepeat = (a: Repeat, b: Repeat) => canon(a) === canon(b);
  if ((winner.doneLog || loser.doneLog) && sameRepeat(winner.repeat, loser.repeat)) {
    const log = mergeLogs(winner.doneLog, loser.doneLog);
    // a completion only one side held in doneFor (a save from before doneLog), replaced on the other side
    for (const side of [winner, loser])
      if (side.doneFor && side.doneFor !== 'once' && log[side.doneFor] === undefined && typeof side.doneAt === 'number') log[side.doneFor] = side.doneAt;
    const trimmed = trimLog(log);
    // the current completion was taken back after it was made (on the other copy): it doesn't count
    const v = out.doneFor ? trimmed[out.doneFor] : undefined;
    if (v !== undefined && v < 0 && -v >= (out.doneAt ?? 0)) out = { ...out, doneFor: null };
    if (!sameLog(trimmed, winner.doneLog)) out = { ...out, doneLog: trimmed };
  }
  return out === winner ? null : out;
}

/** What missing the quest costs: its own choice, else flexible for repeating quests; null when nothing. */
export function stakesOf(task: Pick<Task, 'stakes' | 'repeat'>): Stakes | null {
  if (task.stakes === 'flexible' || task.stakes === 'must') return task.stakes;
  if (task.stakes === 'none') return null;
  return task.repeat.kind === 'none' ? null : 'flexible';
}

/**
 * Whose deadline it is. On a party list, the quest's own maker gets its notifications, its "what happened?"
 * question and its hit (older quests that don't say who made them: the list's owner); nobody else does.
 */
export function deadlineIsMine(task: Pick<Task, 'createdBy'>, list: Pick<TaskList, 'shared' | 'ownerId'>, heroName: string | undefined, accountId: string | null | undefined): boolean {
  if (!list.shared) return true;
  if (task.createdBy) return !!heroName && task.createdBy === heroName;
  return !list.ownerId || !accountId || list.ownerId === accountId;
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
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, cfg.dayStartHour).getTime();
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
  if (by !== null) {
    // "every day by 10:00": the window is the logical day up to that time (it may already be over); by the
    // clock on the wall, also on the days summer time starts or ends
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), cfg.dayStartHour).getTime();
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (by < cfg.dayStartHour * 3600_000 ? 1 : 0), 0, 0, 0, by).getTime();
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
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, cfg.dayStartHour).getTime();
}

/** A time limit the player set on purpose (not just the end of a repeating quest's day or week). */
export function hasLimit(task: Task, cfg: TimeCfg): boolean {
  return task.repeat.kind === 'none' ? deadlineOf(task, cfg) !== null : stakesOf(task) !== null || byTimeOf(task) !== null;
}

/** The whole current repeat period, from its first to its last moment. */
function periodWindow(task: Task, now: number, cfg: TimeCfg): { start: number; end: number } | null {
  const r = task.repeat;
  const d = logicalDate(now, cfg);
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
  // at the day start by the clock on the wall (a day is not always 24 hours)
  const at = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate(), cfg.dayStartHour).getTime();
  return { start: at(first), end: at(next) };
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
 * The repeating quest's time window that ended most recently: a moment inside it, its period key and its
 * end. For a "done by" quest that is today's (once its time has come) or yesterday's; otherwise the period
 * before the current one. Null for one-off quests.
 */
export function lastWindow(task: Task, now: number, cfg: TimeCfg): { at: number; key: string; end: number } | null {
  if (task.repeat.kind === 'none') return null;
  if (byTimeOf(task) !== null) {
    const today = windowOf(task, now, cfg)!;
    if (now >= today.end) return { at: now, key: periodKey(task.repeat, now, cfg), end: today.end };
    // today's window is still open, so yesterday's was the last (with the more time asked for then, if any)
    const at = today.start - 1;
    return { at, key: periodKey(task.repeat, at, cfg), end: windowOf(task, at, cfg)!.end };
  }
  const w = periodWindow(task, now, cfg);
  if (!w) return null;
  const at = w.start - 1; // the previous period
  return { at, key: periodKey(task.repeat, at, cfg), end: w.start };
}

/**
 * The repeating quest's window that ended undone and has not been counted yet: its period key and end, or
 * null. One-off quests are asked about (see askDue).
 */
export function missedAt(task: Task, now: number, cfg: TimeCfg): { key: string; end: number } | null {
  if (task.deleted || task.repeat.kind === 'none' || !stakesOf(task)) return null;
  const w = lastWindow(task, now, cfg);
  if (!w) return null;
  const { at, key, end } = w;
  // a quest counts from when it was made; without stakes of its own, only from periods begun after the
  // default came in
  if (task.createdAt >= end || !stakesAt(task, at, cfg)) return null;
  // windows up to the last counted one are settled (older saves only remember its key)
  // (the same period counted under an end worked out another way, e.g. before windows went by the wall clock;
  // not the more time asked for it)
  if (task.missedEnd !== undefined ? end <= task.missedEnd || (task.missedFor === key && task.extendFor?.until !== end) : task.missedFor === key) return null;
  // done in that period, even if done again since (doneFor then holds the newer one); a "done by" quest
  // only counts when done in time. Taken back (a negative time) is not done.
  const logged = task.doneLog?.[key];
  const timed = byTimeOf(task) !== null;
  if (logged !== undefined && logged > 0 && (!timed || logged <= end)) return null;
  if (task.doneFor === key && (logged === undefined || logged > 0 || (task.doneAt ?? 0) > -logged) && (!timed || (task.doneAt ?? 0) <= end)) return null;
  // saves from before doneLog kept only the latest completion: one made after this window may have replaced
  // a completion in it, so there is no telling, and nobody is charged for it
  if (task.doneLog === undefined && task.doneFor && task.doneFor !== key && (task.doneAt ?? 0) > end) return null;
  // days a "some days" quest is off are not misses
  return activeOn(task, at, cfg) ? { key, end } : null;
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
