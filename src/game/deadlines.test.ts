import { describe, expect, it } from 'vitest';
import type { Task } from '../core/types';
import { dateKey } from '../core/time';
import { askDue, leftLabel, missPenalty, missedWindow, timeLeft, windowOf } from './deadlines';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime(); // October 2026, local time
const day = (d: number) => dateKey(new Date(2026, 9, d));
const cfg = { dayStartHour: 0, weekStart: 1 };
const task = (extra: Partial<Task> = {}): Task =>
  ({ id: 't', listId: 'L', title: 'Pay rent', difficulty: 2, repeat: { kind: 'daily' }, order: 0, createdAt: at(1, 8), updatedAt: 1, timesDone: 0, ...extra }) as Task;

describe('countdown', () => {
  it('runs from when a one-off deadline was set to the deadline', () => {
    const t = task({ repeat: { kind: 'none' }, deadlineSetAt: at(15, 10), deadline: at(15, 14) });
    expect(timeLeft(t, at(15, 10), cfg)).toBe(1);
    expect(timeLeft(t, at(15, 12), cfg)).toBe(0.5);
    expect(timeLeft(t, at(15, 15), cfg)).toBe(0);
    expect(leftLabel(t, at(15, 12, 30), cfg)).toBe('1h 30m left');
    expect(leftLabel(t, at(15, 13, 50), cfg)).toBe('10m left');
    expect(leftLabel(t, at(15, 15), cfg)).toBe('time is up');
    expect(timeLeft({ ...t, doneFor: 'once' }, at(15, 12), cfg)).toBeNull();
  });

  it('runs over the day for "every day by 10:00", and over the whole period otherwise', () => {
    const by = task({ byTime: '10:00' });
    expect(windowOf(by, at(15, 7), cfg)).toEqual({ start: at(15, 0), end: at(15, 10) });
    const weekly = task({ repeat: { kind: 'weekly' }, stakes: 'flexible' });
    expect(windowOf(weekly, at(15, 7), cfg)).toEqual({ start: at(12, 0), end: at(19, 0) }); // Mon 12th to Mon 19th
    const monthly = task({ repeat: { kind: 'monthly' }, stakes: 'flexible' });
    expect(windowOf(monthly, at(15, 7), cfg)).toEqual({ start: at(1, 0), end: new Date(2026, 10, 1).getTime() });
    const every3 = task({ repeat: { kind: 'interval', every: 3, anchor: day(10) }, stakes: 'must' });
    expect(windowOf(every3, at(15, 7), cfg)).toEqual({ start: at(13, 0), end: at(16, 0) });
    // a plain daily with neither a time nor stakes has no countdown; a weekly ignores a "by" time
    expect(windowOf(task(), at(15, 7), cfg)).toBeNull();
    expect(windowOf(task({ repeat: { kind: 'weekly' }, byTime: '10:00' }), at(15, 7), cfg)).toBeNull();
  });
});

describe('missed windows', () => {
  it('counts a daily "by" time once it passes undone, once', () => {
    const t = task({ byTime: '10:00', stakes: 'must' });
    expect(missedWindow(t, at(15, 9), cfg)).toBe(day(14)); // yesterday's window ended undone
    expect(missedWindow({ ...t, missedFor: day(14) }, at(15, 9), cfg)).toBeNull();
    expect(missedWindow({ ...t, missedFor: day(14) }, at(15, 11), cfg)).toBe(day(15));
    // done in time, or done late
    expect(missedWindow({ ...t, missedFor: day(14), doneFor: day(15), doneAt: at(15, 9) }, at(15, 11), cfg)).toBeNull();
    expect(missedWindow({ ...t, missedFor: day(14), doneFor: day(15), doneAt: at(15, 10, 30) }, at(15, 11), cfg)).toBe(day(15));
    // a quest made after the window closed was never missed; no stakes, no misses
    expect(missedWindow({ ...t, createdAt: at(15, 10, 30) }, at(15, 11), cfg)).toBeNull();
    expect(missedWindow({ ...t, stakes: undefined }, at(15, 11), cfg)).toBeNull();
  });

  it('counts the previous period of a weekly, monthly or every-N-days quest', () => {
    const weekly = task({ repeat: { kind: 'weekly' }, stakes: 'flexible' });
    expect(missedWindow(weekly, at(15, 7), cfg)).toBe('w' + day(5));
    expect(missedWindow({ ...weekly, doneFor: 'w' + day(5) }, at(15, 7), cfg)).toBeNull();
    // mid-month, a monthly quest not done yet this month was not missed (the month isn't over)
    const monthly = task({ repeat: { kind: 'monthly' }, stakes: 'flexible', createdAt: at(1, 8) });
    expect(missedWindow(monthly, at(31, 7), cfg)).toBeNull();
    const every3 = task({ repeat: { kind: 'interval', every: 3, anchor: day(1) }, stakes: 'must', createdAt: at(1, 8) });
    expect(missedWindow(every3, at(11, 7), cfg)).toBe(`i${day(1)}:2`); // the 7th-9th block
    expect(missedWindow({ ...every3, doneFor: `i${day(1)}:2` }, at(11, 7), cfg)).toBeNull();
  });

  it('skips the days a "some days" quest is off', () => {
    const t = task({ repeat: { kind: 'days', days: [1, 3, 5] }, stakes: 'must' }); // Mon, Wed, Fri
    expect(missedWindow(t, at(15, 7), cfg)).toBe(day(14)); // Thu 15th: Wed 14th was on
    expect(missedWindow(t, at(16, 7), cfg)).toBeNull(); // Fri 16th: Thu 15th was off
  });
});

describe('asking about a one-off', () => {
  const t = task({ repeat: { kind: 'none' }, deadline: at(15, 14), stakes: 'flexible' });
  it('asks once the deadline passed, then not again for half a day, and never once answered', () => {
    expect(askDue(t, at(15, 13))).toBe(false);
    expect(askDue(t, at(15, 15))).toBe(true);
    expect(askDue({ ...t, askedAt: at(15, 15) }, at(15, 20))).toBe(false);
    expect(askDue({ ...t, askedAt: at(15, 15) }, at(16, 4))).toBe(true);
    expect(askDue({ ...t, deadlineOutcome: 'missed' }, at(16, 4))).toBe(false);
    expect(askDue({ ...t, doneFor: 'once' }, at(16, 4))).toBe(false);
  });
});

describe('miss penalty', () => {
  it('hurts more for must-do quests and for every miss in a row', () => {
    expect(missPenalty(1000, 'flexible', 1, 5)).toBe(30);
    expect(missPenalty(1000, 'must', 1, 5)).toBe(80);
    expect(missPenalty(1000, 'must', 3, 5)).toBe(160);
    expect(missPenalty(1000, 'must', 20, 5)).toBe(280); // grows up to 3.5x
    expect(missPenalty(10, 'must', 1, 5)).toBe(10); // never more than you have
    expect(missPenalty(0, 'must', 1, 5)).toBe(0);
  });
});
