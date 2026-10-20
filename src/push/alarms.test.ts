import { describe, expect, it } from 'vitest';
import type { Hero, Task, TaskList } from '../core/types';
import { dateKey } from '../core/time';
import { DEFAULT_PUSH_PREFS, type NudgeState, type PushPrefs } from './nudges';
import { alarmsFor, awake } from './alarms';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime(); // October 2026, local time
const day = (d: number) => dateKey(new Date(2026, 9, d));
const cfg = { dayStartHour: 0, weekStart: 1 };
const prefs = (p: Partial<PushPrefs> = {}): PushPrefs => ({ ...DEFAULT_PUSH_PREFS, ...p });
const list = (id: string, extra: Partial<TaskList> = {}): TaskList =>
  ({ id, name: id, type: 'quests', theme: 'forest', skill: 'lore', color: '', order: 0, createdAt: 1, updatedAt: 1, ...extra }) as TaskList;
const task = (id: string, listId: string, extra: Partial<Task> = {}): Task =>
  ({ id, listId, title: id, difficulty: 2, repeat: { kind: 'daily' }, order: 0, createdAt: 1, updatedAt: 1, timesDone: 0, ...extra }) as Task;
const hero = { name: 'Aria', activeDays: [], savedDays: [] } as unknown as Hero;
const lists = [list('D', { type: 'daily' }), list('Q'), list('S', { shared: true }), list('G', { type: 'supply' })];
const state = (tasks: Task[]): NudgeState => ({ hero, lists: Object.fromEntries(lists.map((l) => [l.id, l])), tasks: Object.fromEntries(tasks.map((t) => [t.id, t])) });
const keys = (tasks: Task[], now: number, p = prefs()) => alarmsFor(state(tasks), now, cfg, p).map((a) => `${a.key.split('@')[0]}@${new Date(a.at).getDate()} ${new Date(a.at).getHours()}:${String(new Date(a.at).getMinutes()).padStart(2, '0')}`);

describe('notification alarms', () => {
  it('warns 3 hours before a one-off deadline and tells when it ran out', () => {
    const rent = task('Rent', 'Q', { repeat: { kind: 'none' }, deadline: at(15, 18), stakes: 'must' });
    const [warn, missed] = alarmsFor(state([rent]), at(15, 9), cfg, prefs());
    expect(warn).toMatchObject({ key: `warn:Rent@${at(15, 18)}`, at: at(15, 15), title: '⚠️ 3h left: Rent', body: 'A must-do, due 6:00 PM. Missing it costs gold.', tag: 'deadline-Rent' });
    expect(missed).toMatchObject({ key: `missed:Rent@${at(15, 18)}`, at: at(15, 18), title: '💥 Missed: Rent', tag: 'missed-Rent' });
    expect(missed.body).toBe('Tap to decide: more time, call it off, or take the hit.');
  });

  it('a deadline only minutes away gets just the "time ran out" note, right on time', () => {
    const quick = task('TEST', 'D', { repeat: { kind: 'none' }, deadline: at(15, 16, 33), stakes: 'must' });
    expect(keys([quick], at(15, 16, 30))).toEqual(['missed:TEST@15 16:33']);
  });

  it('nothing for done, answered or deleted quests, party lists, groceries, or quests without a time limit', () => {
    const base = { repeat: { kind: 'none' as const }, deadline: at(15, 18), stakes: 'must' as const };
    const tasks = [
      task('Done', 'Q', { ...base, doneFor: 'once' }),
      task('Answered', 'Q', { ...base, deadlineOutcome: 'missed' }),
      task('Gone', 'Q', { ...base, deleted: true }),
      task('Shared', 'S', base),
      task('Milk', 'G', base),
      task('Someday', 'Q', { repeat: { kind: 'none' } }),
      task('No stakes daily', 'D', { stakes: 'none' }),
    ];
    expect(alarmsFor(state(tasks), at(15, 9), cfg, prefs())).toEqual([]);
    expect(alarmsFor({ ...state([task('Rent', 'Q', base)]), hero: null }, at(15, 9), cfg, prefs())).toEqual([]);
  });

  it('a daily "done by" quest gets alarms for today and the next days, but not for today once done', () => {
    const meds = task('Meds', 'D', { byTime: '20:00', stakes: 'must', misses: 2 });
    expect(keys([meds], at(15, 9))).toEqual(['warn:Meds@15 17:00', 'missed:Meds@15 20:00', 'warn:Meds@16 17:00', 'missed:Meds@16 20:00', 'warn:Meds@17 17:00', 'missed:Meds@17 20:00']);
    expect(keys([{ ...meds, doneFor: day(15) }], at(15, 9))).toEqual(['warn:Meds@16 17:00', 'missed:Meds@16 20:00', 'warn:Meds@17 17:00', 'missed:Meds@17 20:00']);
    const [warn, missed] = alarmsFor(state([meds]), at(15, 9), cfg, prefs());
    expect(warn.body).toBe("Missed 2× in a row already. Don't make it 3. Due 8:00 PM.");
    expect(missed.body).toBe('3× in a row: your hero takes the hit. Did it after all? Tap to say so.');
  });

  it('a plain daily is flexible by default: warned before the day ends, told when it was missed', () => {
    const plain = task('Read', 'D');
    expect(keys([plain], at(15, 9)).slice(0, 2)).toEqual(['warn:Read@15 21:00', 'missed:Read@16 9:00']);
    const [, missed] = alarmsFor(state([plain]), at(15, 9), cfg, prefs());
    expect(missed.body).toBe('Your hero takes the hit. Did it after all? Tap to say so.');
  });

  it('keeps quiet at night: a midnight miss is told in the morning, a warning moves to when people are up', () => {
    const read = task('Read', 'D', { stakes: 'flexible' }); // due by the end of the day (midnight)
    expect(keys([read], at(15, 9)).slice(0, 2)).toEqual(['warn:Read@15 21:00', 'missed:Read@16 9:00']);
    expect(awake(at(15, 23), prefs({ morningHour: 7 }))).toBe(at(16, 7));
    expect(awake(at(15, 5), prefs())).toBe(at(15, 9));
    expect(awake(at(15, 12), prefs())).toBe(at(15, 12));
    // a 7:00 deadline: the 4:00 warning would come too late once the night is over, so there is none
    const early = task('Gym', 'Q', { repeat: { kind: 'none' }, deadline: at(16, 7), stakes: 'must' });
    expect(keys([early], at(15, 20), prefs({ morningHour: 9 }))).toEqual(['missed:Gym@16 9:00']);
  });

  it('skips the days a "some days" quest is off, and follows more time asked for today', () => {
    // Thursday 15th: Mon/Wed/Fri only
    const gym = task('Gym', 'D', { repeat: { kind: 'days', days: [1, 3, 5] }, byTime: '19:00', stakes: 'must' });
    expect(keys([gym], at(15, 9))).toEqual(['warn:Gym@16 16:00', 'missed:Gym@16 19:00']);
    const later = task('Meds', 'D', { byTime: '10:00', stakes: 'must', extendFor: { key: day(15), until: at(15, 13) } });
    expect(keys([later], at(15, 10, 30))[0]).toBe('missed:Meds@15 13:00');
  });

  it('a weekly quest gets its end-of-week alarms', () => {
    const laundry = task('Laundry', 'D', { repeat: { kind: 'weekly' }, stakes: 'flexible' });
    // Thursday the 15th; the week ends Monday the 19th at midnight (alarms only cover the next 3 days)
    expect(keys([laundry], at(15, 9))).toEqual([]);
    expect(keys([laundry], at(18, 9))).toEqual(['warn:Laundry@18 21:00', 'missed:Laundry@19 9:00']);
  });
});
