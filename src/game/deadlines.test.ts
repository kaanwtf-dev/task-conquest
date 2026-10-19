import { describe, expect, it } from 'vitest';
import type { Task } from '../core/types';
import { dateKey } from '../core/time';
import { answerCost, askDue, leftLabel, missPenalty, missedAt, missedWindow, moreTimeOptions, needsAnswer, timeLeft, windowOf } from './deadlines';

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
    // a plain daily counts down its day; a weekly ignores a "by" time
    expect(windowOf(task(), at(15, 7), cfg)).toEqual({ start: at(15, 0), end: at(16, 0) });
    expect(windowOf(task({ repeat: { kind: 'weekly' }, byTime: '10:00' }), at(15, 7), cfg)).toEqual({ start: at(12, 0), end: at(19, 0) });
  });

  it('runs a one-off with a due date to the end of that day, or to its exact time', () => {
    const t = task({ repeat: { kind: 'none' }, due: day(16), createdAt: at(14, 0) });
    expect(windowOf(t, at(15, 7), cfg)).toEqual({ start: at(14, 0), end: at(17, 0) });
    expect(windowOf(t, at(15, 7), { ...cfg, dayStartHour: 4 })!.end).toBe(at(17, 4));
    expect(windowOf({ ...t, deadline: at(16, 18) }, at(15, 7), cfg)!.end).toBe(at(16, 18));
    expect(windowOf(task({ repeat: { kind: 'none' } }), at(15, 7), cfg)).toBeNull();
    expect(timeLeft(t, at(16, 0), cfg)).toBeCloseTo(1 / 3);
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
  it('asks about a quest whose due date has passed', () => {
    const dated = task({ repeat: { kind: 'none' }, due: day(15) });
    expect(askDue(dated, at(15, 23), cfg)).toBe(false);
    expect(askDue(dated, at(16, 9), cfg)).toBe(true);
  });
  it('asks once the deadline passed, then not again for an hour after it was closed, and never once answered', () => {
    expect(askDue(t, at(15, 13), cfg)).toBe(false);
    expect(askDue(t, at(15, 15), cfg)).toBe(true);
    expect(askDue({ ...t, askedAt: at(15, 15) }, at(15, 15, 30), cfg)).toBe(false);
    expect(askDue({ ...t, askedAt: at(15, 15) }, at(15, 16, 1), cfg)).toBe(true);
    expect(askDue({ ...t, deadlineOutcome: 'missed' }, at(16, 4), cfg)).toBe(false);
    expect(askDue({ ...t, doneFor: 'once' }, at(16, 4), cfg)).toBe(false);
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

describe('what happened?', () => {
  const meds = task({ byTime: '10:00', stakes: 'must' });

  it('more time moves today\'s end, then a miss is counted from the new end', () => {
    const extended = { ...meds, missedFor: day(15), missedEnd: at(15, 10), extendFor: { key: day(15), until: at(15, 13) } };
    expect(windowOf(extended, at(15, 11), cfg)).toEqual({ start: at(15, 0), end: at(15, 13) });
    expect(missedAt(extended, at(15, 12), cfg)).toBeNull(); // still open (and yesterday's is not counted again)
    expect(missedAt(extended, at(15, 14), cfg)).toEqual({ key: day(15), end: at(15, 13) });
    expect(windowOf(extended, at(16, 9), cfg)).toEqual({ start: at(16, 0), end: at(16, 10) }); // only that day
  });

  it('offers more time for one-offs, and for "done by" quests only while their day lasts', () => {
    expect(moreTimeOptions(task({ repeat: { kind: 'none' } }), at(15, 12), cfg)).toEqual([3600_000, 3 * 3600_000, 86_400_000]);
    const pending = { ...meds, pendingMiss: { key: day(15), end: at(15, 10) } };
    const opts = moreTimeOptions(pending, at(15, 11), cfg);
    expect(opts.slice(0, 2)).toEqual([3600_000, 3 * 3600_000]);
    expect(at(15, 11) + opts[2]).toBe(at(15, 23, 59)); // or the rest of today
    expect(moreTimeOptions(pending, at(15, 23, 20), cfg)).toEqual([at(15, 23, 59) - at(15, 23, 20)]);
    expect(moreTimeOptions(pending, at(16, 8), cfg)).toEqual([]); // that day is over
    expect(moreTimeOptions({ ...meds, byTime: undefined, pendingMiss: { key: day(14), end: at(15, 0) } }, at(15, 8), cfg)).toEqual([]);
  });

  it('costs: missing the full penalty; more time or calling it off half for must-dos, free otherwise', () => {
    const full = missPenalty(1000, 'must', 1, 5);
    expect(answerCost(meds, 'missed', 1000, 5)).toBe(full);
    expect(answerCost(meds, 'cancel', 1000, 5)).toBe(Math.round(full / 2));
    expect(answerCost(meds, { more: 3600_000 }, 1000, 5)).toBe(Math.round(full / 2));
    expect(answerCost(meds, 'done', 1000, 5)).toBe(0);
    expect(answerCost({ ...meds, stakes: 'flexible' }, 'cancel', 1000, 5)).toBe(0);
    expect(answerCost({ ...meds, stakes: undefined }, 'missed', 1000, 5)).toBe(0);
  });

  it('asks until answered, and not again for an hour after it was closed', () => {
    const pending = { ...meds, pendingMiss: { key: day(15), end: at(15, 10) } };
    expect(needsAnswer(pending, at(15, 11), cfg)).toBe(true);
    expect(needsAnswer({ ...pending, askedAt: at(15, 11) }, at(15, 11, 30), cfg)).toBe(false);
    expect(needsAnswer({ ...pending, askedAt: at(15, 11) }, at(15, 12, 1), cfg)).toBe(true);
    expect(needsAnswer({ ...pending, pendingMiss: null }, at(15, 11), cfg)).toBe(false);
  });
});
