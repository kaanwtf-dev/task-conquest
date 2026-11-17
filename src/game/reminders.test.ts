import { describe, expect, it } from 'vitest';
import type { Task, TaskList } from '../core/types';
import { dateKey } from '../core/time';
import { datedReminders, reminderState, reminderTimes, remindersOn, upcomingReminders } from './reminders';
import { todaySections } from '../state/today';
import { alarmsFor } from '../push/alarms';
import { DEFAULT_PUSH_PREFS } from '../push/nudges';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const cfg = { dayStartHour: 0, weekStart: 1 };
const task = (extra: Partial<Task> = {}): Task =>
  ({ id: 'mag', listId: 'D', title: 'Take magnesium', difficulty: 2, repeat: { kind: 'daily' }, order: 0, createdAt: 1, updatedAt: 1, timesDone: 0, remindAt: ['21:30'], stakes: 'none', ...extra }) as Task;
const list = { id: 'D', name: 'Daily', type: 'daily', theme: 'forest', skill: 'lore', color: '', order: 0, createdAt: 1, updatedAt: 1 } as TaskList;

describe('remind me at', () => {
  it('keeps valid times only, soonest first, at most three', () => {
    expect(reminderTimes({ remindAt: ['21:30', 'junk', '09:00', '09:00', '12:00', '15:00'] })).toEqual([9, 12, 15].map((h) => h * 3600_000));
  });

  it('is at its time by the clock on the wall, also on the days the clocks change', () => {
    // Nov 1 2026 (summer time ends in the US) and Mar 8 2026 (it starts): 21:30 stays 21:30 wherever that happens
    for (const day of [new Date(2026, 10, 1, 12), new Date(2026, 2, 8, 12), new Date(2026, 9, 25, 12)]) {
      const [when] = remindersOn(task(), day.getTime(), cfg);
      expect([new Date(when).getDate(), new Date(when).getHours(), new Date(when).getMinutes()]).toEqual([day.getDate(), 21, 30]);
    }
    // a time before the day starts belongs to the end of the logical day, on the next calendar day
    const late = remindersOn(task({ remindAt: ['01:15'] }), new Date(2026, 10, 1, 12).getTime(), { dayStartHour: 4, weekStart: 1 });
    expect([new Date(late[0]).getDate(), new Date(late[0]).getHours(), new Date(late[0]).getMinutes()]).toEqual([2, 1, 15]);
  });

  it('is out of the way until its time, then due until done or snoozed', () => {
    expect(reminderState(task(), at(27, 12), cfg)).toBe('later');
    expect(reminderState(task(), at(27, 21, 30), cfg)).toBe('due');
    expect(reminderState(task(), at(27, 23), cfg)).toBe('due');
    expect(reminderState(task({ doneFor: dateKey(new Date(2026, 9, 27)) }), at(27, 22), cfg)).toBe('none');
    expect(reminderState(task({ snoozedUntil: at(27, 21, 45) }), at(27, 21, 35), cfg)).toBe('later');
    expect(reminderState(task({ snoozedUntil: at(27, 21, 45) }), at(27, 21, 46), cfg)).toBe('due');
    expect(reminderState(task({ remindAt: undefined }), at(27, 22), cfg)).toBe('none');
    // "some days": only on its days (Tuesday 27th is day 2)
    expect(reminderState(task({ repeat: { kind: 'days', days: [1, 3] } }), at(27, 22), cfg)).toBe('none');
  });

  it('Today hides it before the time and puts it on top after', () => {
    const tasks = { mag: task() };
    expect(todaySections({ D: list }, tasks, at(27, 12), cfg).reminders).toEqual([]);
    expect(todaySections({ D: list }, tasks, at(27, 12), cfg).routine).toEqual([]);
    expect(todaySections({ D: list }, tasks, at(27, 22), cfg).reminders.map((x) => x.id)).toEqual(['mag']);
    expect(todaySections({ D: list }, tasks, at(27, 22), cfg).routine).toEqual([]);
  });

  it('plans a notification at each reminder time, none on a day it is done, and none for a deadline it does not have', () => {
    expect(upcomingReminders(task(), at(27, 12), at(29, 12), cfg)).toEqual([at(27, 21, 30), at(28, 21, 30)]);
    expect(upcomingReminders(task({ doneFor: dateKey(new Date(2026, 9, 27)) }), at(27, 12), at(29, 12), cfg)).toEqual([at(28, 21, 30)]);
    const hero = { name: 'Kenny', activeDays: [], savedDays: [] } as never;
    const alarms = alarmsFor({ hero, lists: { D: list }, tasks: { mag: task() } }, at(27, 12), cfg, DEFAULT_PUSH_PREFS);
    expect(alarms.map((a) => a.key.split('@')[0])).toEqual(['remind:mag', 'remind:mag', 'remind:mag']);
    expect(alarms[0]).toMatchObject({ at: at(27, 21, 30), title: '🔔 Time for: Take magnesium', tag: 'remind-mag' });
  });
});

describe('reminders before a deadline', () => {
  // a one-off due Friday Nov 20 at 17:00
  const fri = new Date(2026, 10, 20, 17).getTime();
  const quest = (extra: Partial<Task> = {}) =>
    task({ repeat: { kind: 'none' }, deadline: fri, remindAt: ['2026-11-19T20:00'], ...extra });
  const when = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

  it('waits until the date and time, then flashes on top until done', () => {
    expect(reminderState(quest(), when(18, 12), cfg)).toBe('later');
    expect(reminderState(quest(), when(19, 20), cfg)).toBe('due');
    expect(reminderState(quest(), when(20, 9), cfg)).toBe('due');
    expect(reminderState(quest({ doneFor: 'once' }), when(19, 21), cfg)).toBe('none');
  });

  it('gets a notification at that moment', () => {
    expect(upcomingReminders(quest(), when(18, 12), when(21, 0), cfg)).toEqual([when(19, 20)]);
  });

  it('ignores a reminder at or after the deadline', () => {
    expect(datedReminders(quest({ remindAt: ['2026-11-20T17:00', '2026-11-21T09:00'] }), cfg)).toEqual([]);
  });

  it('a missed deadline stays on top, flashing, until ticked', () => {
    const plain = quest({ remindAt: undefined });
    expect(reminderState(plain, when(20, 16), cfg)).toBe('none');
    expect(reminderState(plain, when(20, 17), cfg)).toBe('due');
    expect(reminderState(plain, when(22, 9), cfg)).toBe('due');
    expect(reminderState({ ...plain, deadlineOutcome: 'missed' }, when(22, 9), cfg)).toBe('due');
    expect(reminderState({ ...plain, doneFor: 'once' }, when(22, 9), cfg)).toBe('none');
  });
});
