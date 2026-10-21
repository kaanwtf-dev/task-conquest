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
      task('Shared', 'S', { ...base, createdBy: 'Bob' }), // a party member's quest is theirs to answer for
      task('Milk', 'G', base),
      task('Someday', 'Q', { repeat: { kind: 'none' } }),
      task('No stakes daily', 'D', { stakes: 'none' }),
    ];
    expect(alarmsFor(state(tasks), at(15, 9), cfg, prefs())).toEqual([]);
    expect(alarmsFor({ ...state([task('Rent', 'Q', base)]), hero: null }, at(15, 9), cfg, prefs())).toEqual([]);
  });

  it('on a party list, the quests this player made get their alarms (older ones: those on lists they own)', () => {
    const mag = task('Magnesium', 'S', { byTime: '21:30', stakes: 'flexible', createdBy: 'Aria' });
    expect(keys([mag], at(15, 9)).slice(0, 2)).toEqual(['warn:Magnesium@15 18:30', 'missed:Magnesium@15 21:30']);
    const old = task('Old', 'S', { byTime: '21:30', stakes: 'flexible' });
    const owned = (ownerId: string, accountId: string) =>
      alarmsFor({ ...state([old]), lists: { S: list('S', { shared: true, ownerId }) }, accountId }, at(15, 9), cfg, prefs()).length;
    expect(owned('me', 'me')).toBeGreaterThan(0);
    expect(owned('friend', 'me')).toBe(0);
  });

  it('a daily "done by" quest gets alarms for today and the next days, but not for today once done', () => {
    const meds = task('Meds', 'D', { byTime: '20:00', stakes: 'must', misses: 2 });
    expect(keys([meds], at(15, 9))).toEqual(['warn:Meds@15 17:00', 'missed:Meds@15 20:00', 'warn:Meds@16 17:00', 'missed:Meds@16 20:00', 'warn:Meds@17 17:00', 'missed:Meds@17 20:00']);
    expect(keys([{ ...meds, doneFor: day(15) }], at(15, 9))).toEqual(['warn:Meds@16 17:00', 'missed:Meds@16 20:00', 'warn:Meds@17 17:00', 'missed:Meds@17 20:00']);
    const [warn, missed] = alarmsFor(state([meds]), at(15, 9), cfg, prefs());
    expect(warn.body).toBe("Missed 2× in a row already. Don't make it 3. Due 8:00 PM.");
    expect(missed.body).toBe("Did you do it? Tap to answer. If not, that's 3× in a row and your hero takes the hit.");
  });

  it('a plain daily is flexible by default: warned before the day ends, told the moment it ran out', () => {
    // from the 21st: plain dailies only count once the default stakes came in (October 20th)
    const plain = task('Read', 'D');
    expect(keys([plain], at(22, 9)).slice(0, 2)).toEqual(['warn:Read@22 21:00', 'missed:Read@23 0:00']);
    const [, missed] = alarmsFor(state([plain]), at(22, 9), cfg, prefs());
    expect(missed.body).toBe('Did you do it? Tap to answer. If not, your hero takes the hit.');
    // a day that began before the default: nothing to tell (the app won't charge it either)
    expect(keys([plain], at(15, 9))).toEqual([]);
  });

  it("time's up goes out the moment time runs out, even at night; only warnings wait for the morning", () => {
    const read = task('Read', 'D', { stakes: 'flexible' }); // due by the end of the day (midnight)
    expect(keys([read], at(15, 9)).slice(0, 2)).toEqual(['warn:Read@15 21:00', 'missed:Read@16 0:00']);
    expect(awake(at(15, 23), prefs({ morningHour: 7 }))).toBe(at(16, 7));
    expect(awake(at(15, 5), prefs())).toBe(at(15, 9));
    expect(awake(at(15, 12), prefs())).toBe(at(15, 12));
    // a 7:00 deadline: the 4:00 warning would come too late once the night is over, so there is none
    const early = task('Gym', 'Q', { repeat: { kind: 'none' }, deadline: at(16, 7), stakes: 'must' });
    expect(keys([early], at(15, 20), prefs({ morningHour: 9 }))).toEqual(['missed:Gym@16 7:00']);
    // a 10:00 deadline: the 7:00 warning waits for 9:00, and is still planned when the app opens at 7:30
    const exam = task('Exam', 'Q', { repeat: { kind: 'none' }, deadline: at(16, 10), stakes: 'must' });
    expect(keys([exam], at(15, 20))).toEqual(['warn:Exam@16 9:00', 'missed:Exam@16 10:00']);
    expect(keys([exam], at(16, 7, 30))).toEqual(['warn:Exam@16 9:00', 'missed:Exam@16 10:00']);
  });

  it('opening the app after midnight keeps the "time\'s up" that is about to go out, and only that one', () => {
    const rent = task('Rent', 'Q', { repeat: { kind: 'none' }, due: day(15), stakes: 'must' }); // ends at midnight
    // a device a few minutes ahead still plans it (the cloud ignores alarms already in the past)
    expect(keys([rent], at(16, 0, 3))).toEqual(['missed:Rent@16 0:00']);
    expect(keys([rent], at(16, 0, 30))).toEqual([]);
    expect(keys([{ ...rent, doneFor: 'once' }], at(16, 0, 3))).toEqual([]);
  });

  it('a miss the app has already counted is told with its real count, and not at all once answered', () => {
    const read = task('Read', 'D', { stakes: 'flexible' });
    // a device clock a little ahead: the app counted the miss (first in a row) before the cloud sent it
    const charged = { ...read, misses: 1, missedEnd: at(16, 0), pendingMiss: { key: day(15), end: at(16, 0), paid: 5, prevMisses: 0 } };
    const [missed] = alarmsFor(state([charged]), at(16, 0, 1), cfg, prefs());
    expect(missed).toMatchObject({ key: `missed:Read@${at(16, 0)}`, body: 'Did you do it? Tap to answer. If not, your hero takes the hit.' });
    expect(keys([{ ...charged, pendingMiss: null }], at(16, 0, 1))[0]).not.toBe('missed:Read@16 0:00');
  });

  it('keeps planning past the night summer time ends, with a late day start', () => {
    const was = process.env.TZ;
    process.env.TZ = 'America/New_York'; // clocks go back on Sunday November 1st, 2026
    try {
      const read = task('Read', 'D', { stakes: 'must' });
      const ends = alarmsFor(state([read]), new Date(2026, 9, 31, 12).getTime(), { dayStartHour: 4, weekStart: 1 }, prefs())
        .filter((a) => a.key.startsWith('missed'))
        .map((a) => new Date(a.at).getDate());
      expect(ends).toEqual([1, 2, 3]);
    } finally {
      process.env.TZ = was;
    }
  });

  it('quests whose time runs out at the same moment share one notification', () => {
    const tasks = ['Read', 'Walk', 'Floss'].map((n, i) => task(n, 'D', { order: i }));
    const alarms = alarmsFor(state(tasks), at(22, 9), cfg, prefs());
    const [warn, missed] = alarms;
    expect(warn).toMatchObject({ key: `warn:@${at(23, 0)}`, at: at(22, 21), title: '⏳ 3h left: 3 quests', body: 'Read, Walk, Floss. Due 12:00 AM.', tag: `deadline-${at(23, 0)}` });
    expect(missed).toMatchObject({ key: `missed:@${at(23, 0)}`, at: at(23, 0), title: "⌛ Time's up: 3 quests", tag: `missed-${at(23, 0)}` });
    expect(missed.body).toBe('Read, Walk, Floss. Did you do them? Tap to answer. If not, your hero takes the hits.');
    // a must-do among them shows in the title; many names are cut short
    const many = [...tasks, task('Meds', 'D', { stakes: 'must', order: 9 }), task('Plants', 'D', { order: 10 })];
    const [, m2] = alarmsFor(state(many), at(22, 9), cfg, prefs());
    expect(m2.title).toBe("💥 Time's up: 5 quests");
    expect(m2.body).toBe('Read, Walk, Floss, Meds +1 more. Did you do them? Tap to answer. If not, your hero takes the hits.');
  });

  it('a "done by" daily without stakes still says when its time is up', () => {
    const walk = task('Walk', 'D', { byTime: '18:00', stakes: 'none' });
    const [warn, missed] = alarmsFor(state([walk]), at(15, 9), cfg, prefs());
    expect(warn).toMatchObject({ key: `warn:Walk@${at(15, 18)}`, body: 'Due 6:00 PM.' });
    expect(missed).toMatchObject({ key: `missed:Walk@${at(15, 18)}`, at: at(15, 18), title: '⌛ Missed: Walk', body: 'It was due 6:00 PM.' });
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
    expect(keys([laundry], at(18, 9))).toEqual(['warn:Laundry@18 21:00', 'missed:Laundry@19 0:00']);
  });
});
