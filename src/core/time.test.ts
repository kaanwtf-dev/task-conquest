import { describe, expect, it } from 'vitest';
import { isActiveToday, isDone, msUntilReset, periodKey, streak, todayKey, weekStartDate, dateKey } from './time';
import type { Task } from './types';

const cfg = { dayStartHour: 0, weekStart: 1 };
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

const task = (repeat: Task['repeat'], doneFor?: string): Task => ({
  id: 't', listId: 'l', title: 'x', difficulty: 2, repeat, order: 0, createdAt: 0, updatedAt: 0, timesDone: 0, doneFor,
});

describe('period keys', () => {
  it('daily tasks reset at midnight', () => {
    const k1 = periodKey({ kind: 'daily' }, at(2026, 10, 12, 23), cfg);
    const k2 = periodKey({ kind: 'daily' }, at(2026, 10, 13, 0), cfg);
    expect(k1).toBe('2026-10-12');
    expect(k2).toBe('2026-10-13');
  });

  it('night owls: day start hour shifts the logical day', () => {
    const owl = { dayStartHour: 4, weekStart: 1 };
    expect(todayKey(at(2026, 10, 13, 3), owl)).toBe('2026-10-12');
    expect(todayKey(at(2026, 10, 13, 5), owl)).toBe('2026-10-13');
  });

  it('weekly keys follow the configured week start', () => {
    // 2026-10-12 is a Monday
    expect(dateKey(weekStartDate(new Date(2026, 9, 18), 1))).toBe('2026-10-12');
    expect(dateKey(weekStartDate(new Date(2026, 9, 18), 0))).toBe('2026-10-18');
    expect(periodKey({ kind: 'weekly' }, at(2026, 10, 12), cfg)).toBe(periodKey({ kind: 'weekly' }, at(2026, 10, 18), cfg));
    expect(periodKey({ kind: 'weekly' }, at(2026, 10, 18), cfg)).not.toBe(periodKey({ kind: 'weekly' }, at(2026, 10, 19), cfg));
  });

  it('one-off tasks stay done', () => {
    const t = task({ kind: 'none' }, 'once');
    expect(isDone(t, at(2030, 1, 1), cfg)).toBe(true);
  });

  it('a daily task done yesterday is open today', () => {
    const t = task({ kind: 'daily' }, '2026-10-11');
    expect(isDone(t, at(2026, 10, 12), cfg)).toBe(false);
  });

  it('specific weekdays are only active on those days', () => {
    const t = task({ kind: 'days', days: [1, 3] }); // Mon, Wed
    expect(isActiveToday(t, at(2026, 10, 12), cfg)).toBe(true);
    expect(isActiveToday(t, at(2026, 10, 13), cfg)).toBe(false);
    expect(isActiveToday(t, at(2026, 10, 14), cfg)).toBe(true);
  });

  it('interval tasks recur every N days from their anchor', () => {
    const t = task({ kind: 'interval', every: 3, anchor: '2026-10-12' });
    expect(isActiveToday(t, at(2026, 10, 12), cfg)).toBe(true);
    expect(isActiveToday(t, at(2026, 10, 13), cfg)).toBe(true); // still on the board until done
    expect(isActiveToday(t, at(2026, 10, 11), cfg)).toBe(false); // not before its first day
    expect(periodKey(t.repeat, at(2026, 10, 12), cfg)).toBe(periodKey(t.repeat, at(2026, 10, 14), cfg));
    expect(periodKey(t.repeat, at(2026, 10, 14), cfg)).not.toBe(periodKey(t.repeat, at(2026, 10, 15), cfg));
  });

  it('reports time until reset', () => {
    const ms = msUntilReset({ kind: 'daily' }, at(2026, 10, 12, 22), cfg)!;
    expect(ms).toBe(2 * 3600000);
    expect(msUntilReset({ kind: 'none' }, at(2026, 10, 12), cfg)).toBeNull();
  });
});

describe('streak', () => {
  it('counts consecutive days ending today or yesterday', () => {
    const days = ['2026-10-09', '2026-10-10', '2026-10-11'];
    expect(streak(days, at(2026, 10, 11), cfg)).toBe(3);
    expect(streak(days, at(2026, 10, 12), cfg)).toBe(3); // today not done yet: still alive
    expect(streak(days, at(2026, 10, 13), cfg)).toBe(0);
    expect(streak([], at(2026, 10, 13), cfg)).toBe(0);
  });
});
