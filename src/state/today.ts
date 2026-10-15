// Single source of truth for the cross-list "Today" view and its badge count.
import type { Task, TaskList } from '../core/types';
import { isActiveToday, isDone, todayKey, type TimeCfg } from '../core/time';

export interface TodaySections {
  overdue: Task[];
  dueToday: Task[];
  routine: Task[];
  week: Task[];
  doneToday: Task[];
}

const ROUTINE = new Set(['daily', 'days', 'interval']);
const PERIODIC = new Set(['weekly', 'monthly']);

export function todaySections(lists: Record<string, TaskList>, tasks: Record<string, Task>, now: number, cfg: TimeCfg): TodaySections {
  const today = todayKey(now, cfg);
  const live = new Set(Object.values(lists).filter((l) => !l.deleted && l.type !== 'supply').map((l) => l.id));
  const all = Object.values(tasks).filter((t) => !t.deleted && live.has(t.listId));
  const order = (a: Task, b: Task) => (lists[a.listId]?.order ?? 0) - (lists[b.listId]?.order ?? 0) || a.order - b.order;
  const open = (t: Task) => !isDone(t, now, cfg);
  // a due date on a repeating task only marks its first occurrence; afterwards it is routine
  const s: TodaySections = {
    overdue: all.filter((t) => t.repeat.kind === 'none' && t.due && t.due < today && open(t)),
    dueToday: all.filter((t) => t.due === today && open(t)),
    routine: all.filter((t) => t.due !== today && ROUTINE.has(t.repeat.kind) && isActiveToday(t, now, cfg) && open(t)),
    week: all.filter((t) => t.due !== today && PERIODIC.has(t.repeat.kind) && open(t)),
    doneToday: all.filter((t) => !!t.doneAt && todayKey(t.doneAt, cfg) === today && isDone(t, now, cfg)),
  };
  for (const k of Object.keys(s) as (keyof TodaySections)[]) s[k].sort(order);
  return s;
}

/** Badge: what still needs doing today (weekly/monthly items are shown but not counted). */
export function todayRemaining(s: TodaySections): number {
  return s.overdue.length + s.dueToday.length + s.routine.length;
}
