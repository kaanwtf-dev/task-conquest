// The party leaderboard: points for the quests done on a day, capped so a mountain of made-up quests is
// worth no more than an honest full day. The server (supabase/schema.sql: log_points) enforces the same cap
// and only takes today or yesterday, and ranks the last 7 days: turning up every day is what wins.
import type { Hero, Task, TaskList } from '../core/types';
import { periodKey, todayKey, type TimeCfg } from '../core/time';

/** Points per quest by difficulty (Trivial .. Epic). */
export const BOARD_POINTS = [0, 1, 2, 3, 5] as const;
/** At most this many points a day (the server caps it too). */
export const DAY_CAP = 20;
export const BOARD_DAYS = 7;

/** Points for the quests finished on the logical day `day` (YYYY-MM-DD). */
export function dayPoints(hero: Hero, lists: Record<string, TaskList>, tasks: Record<string, Task>, day: string, cfg: TimeCfg): number {
  let total = 0;
  for (const t of Object.values(tasks)) {
    const l = lists[t.listId];
    if (t.deleted || !l || l.deleted || l.type === 'supply' || !t.doneFor || !t.doneAt) continue;
    if (todayKey(t.doneAt, cfg) !== day) continue;
    // on a party list, only what this hero did
    if (l.shared && t.doneBy !== hero.name) continue;
    const p = BOARD_POINTS[t.difficulty] ?? 0;
    total += p;
    // a repeating quest done again the same day: half points each time
    if (t.again && t.repeat.kind !== 'none' && t.again.period === periodKey(t.repeat, t.doneAt, cfg)) total += Math.floor(p / 2) * t.again.n;
  }
  return Math.min(DAY_CAP, total);
}

export interface BoardRow {
  userId: string;
  name: string;
  points: number;
  days: number;
}

/** Most points first; ties go to whoever showed up on more days, then by name. */
export function rankBoard<T extends BoardRow>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.days - a.days || a.name.localeCompare(b.name));
  let rank = 0;
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.points !== r.points || prev.days !== r.days) rank = i + 1; // ties share a place
    return { ...r, rank };
  });
}
