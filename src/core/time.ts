// Period keys decide whether a repeating task counts as "done" right now — no reset jobs needed.
import type { Repeat, Task } from './types';

export interface TimeCfg {
  dayStartHour: number;
  weekStart: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The "logical" day: before dayStartHour it's still yesterday (for night owls). */
export function logicalDate(now: number, cfg: TimeCfg): Date {
  const d = new Date(now);
  d.setHours(d.getHours() - cfg.dayStartHour);
  return d;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: number, cfg: TimeCfg): string {
  return dateKey(logicalDate(now, cfg));
}

export function parseDateKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function weekStartDate(d: Date, weekStart: number): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (s.getDay() - weekStart + 7) % 7;
  s.setDate(s.getDate() - diff);
  return s;
}

export function periodKey(repeat: Repeat, now: number, cfg: TimeCfg): string {
  const d = logicalDate(now, cfg);
  switch (repeat.kind) {
    case 'none':
      return 'once';
    case 'daily':
    case 'days':
      return dateKey(d);
    case 'weekly':
      return 'w' + dateKey(weekStartDate(d, cfg.weekStart));
    case 'monthly':
      return `m${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    case 'interval': {
      const n = Math.max(1, repeat.every);
      const k = Math.floor(daysBetween(parseDateKey(repeat.anchor), d) / n);
      return `i${repeat.anchor}:${k}`;
    }
  }
}

export function isDone(task: Task, now: number, cfg: TimeCfg): boolean {
  return !!task.doneFor && task.doneFor === periodKey(task.repeat, now, cfg);
}

/** Is a repeating task scheduled for the current logical day? */
export function isActiveToday(task: Task, now: number, cfg: TimeCfg): boolean {
  const r = task.repeat;
  if (r.kind === 'days') return r.days.includes(logicalDate(now, cfg).getDay());
  // 'every N days' stays on the board for its whole N-day period (done or not), like daily/weekly
  if (r.kind === 'interval') return daysBetween(parseDateKey(r.anchor), logicalDate(now, cfg)) >= 0;
  return true;
}

/** Milliseconds until a repeat period rolls over (for "resets in" labels). */
export function msUntilReset(repeat: Repeat, now: number, cfg: TimeCfg): number | null {
  const d = logicalDate(now, cfg);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let next: Date;
  switch (repeat.kind) {
    case 'daily':
    case 'days':
    case 'interval':
      next = new Date(start);
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next = weekStartDate(d, cfg.weekStart);
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      break;
    default:
      return null;
  }
  return next.getTime() + cfg.dayStartHour * 3600000 - now;
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m % 60}m`;
}

export function repeatLabel(r: Repeat): string {
  switch (r.kind) {
    case 'none':
      return '';
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'days':
      return r.days.map((x) => 'SMTWTFS'[x]).join('');
    case 'interval':
      return `Every ${r.every}d`;
  }
}

/** Current streak (consecutive days with >=1 completion), counting back from today or yesterday. */
export function streak(activeDays: string[], now: number, cfg: TimeCfg): number {
  const set = new Set(activeDays);
  const d = logicalDate(now, cfg);
  let cur = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (!set.has(dateKey(cur))) cur.setDate(cur.getDate() - 1);
  let n = 0;
  while (set.has(dateKey(cur))) {
    n++;
    cur.setDate(cur.getDate() - 1);
  }
  return n;
}
