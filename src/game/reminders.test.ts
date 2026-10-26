import { describe, expect, it } from 'vitest';
import type { Task, TaskList } from '../core/types';
import { dateKey } from '../core/time';
import { reminderState, reminderTimes, upcomingReminders } from './reminders';
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
