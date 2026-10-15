import { describe, expect, it } from 'vitest';
import type { Hero, Task, TaskList } from '../core/types';
import { dateKey } from '../core/time';
import { bossFor } from '../game/bosses';
import { DEFAULT_PUSH_PREFS, afterSlot, pickNudge, slotAt, type NudgeState, type PushPrefs } from './nudges';

const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime(); // October 2026, local time
const day = (d: number) => dateKey(new Date(2026, 9, d));
const prefs = (p: Partial<PushPrefs> = {}): PushPrefs => ({ ...DEFAULT_PUSH_PREFS, ...p });

const list = (id: string, extra: Partial<TaskList> = {}): TaskList =>
  ({ id, name: id, type: 'quests', theme: 'forest', skill: 'lore', color: '', order: 0, createdAt: 1, updatedAt: 1, ...extra }) as TaskList;
const task = (id: string, listId: string, extra: Partial<Task> = {}): Task =>
  ({ id, listId, title: id, difficulty: 2, repeat: { kind: 'daily' }, order: 0, createdAt: 1, updatedAt: 1, timesDone: 0, ...extra }) as Task;
const hero = (extra: Partial<Hero> = {}): Hero => ({ name: 'Aria', activeDays: [], savedDays: [], bossIndex: 1, bossDamage: {}, ...extra }) as unknown as Hero;

function state(h: Hero | null, tasks: Task[], lists: TaskList[] = [list('D', { type: 'daily' }), list('Q')]): NudgeState {
  return { hero: h, lists: Object.fromEntries(lists.map((l) => [l.id, l])), tasks: Object.fromEntries(tasks.map((t) => [t.id, t])) };
}

describe('reminder slots', () => {
  it('opens a two-hour window at each chosen hour', () => {
    const p = prefs({ morningHour: 9, eveningHour: 20 });
    expect([8, 9, 10, 11, 19, 20, 21, 22].map((h) => slotAt(at(15, h), p))).toEqual([null, 'morning', 'morning', null, null, 'evening', 'evening', null]);
  });
  it('wraps past midnight', () => {
    const p = prefs({ eveningHour: 23 });
    expect(slotAt(at(15, 23), p)).toBe('evening');
    expect(slotAt(at(16, 0), p)).toBe('evening');
    expect(slotAt(at(16, 1), p)).toBeNull();
  });
});

describe('morning reminder', () => {
  const tasks = [
    task('Brush teeth', 'D', { difficulty: 1 }),
    task('Workout', 'D', { difficulty: 4 }),
    task('Read', 'D', { difficulty: 3 }),
    task('Done already', 'D', { doneFor: day(15) }),
    task('Someday', 'Q', { repeat: { kind: 'none' } }), // no due date: not today's business
    task('Tax form', 'Q', { repeat: { kind: 'none' }, due: day(15) }),
    task('Milk', 'G', { repeat: { kind: 'none' } }),
  ];
  const lists = [list('D', { type: 'daily' }), list('Q'), list('G', { type: 'supply' })];

  it("lists today's quests, hardest first, and the boss", () => {
    const n = pickNudge(state(hero({ activeDays: [day(14)] }), tasks, lists), at(15, 9), 'morning', prefs())!;
    expect(n.kind).toBe('plan');
    expect(n.title).toBe('⚔️ 4 quests today');
    expect(n.body).toBe(`Workout, Read +2 more. ${bossFor(1).name} has ${bossFor(1).maxHp.toLocaleString('en-US')} HP left.`);
    expect(n.badge).toBe(4); // groceries, undated one-offs and done ones never count
  });

  it('says nothing with nothing due, when switched off, or twice in a day', () => {
    const h = hero({ activeDays: [day(14)] });
    expect(pickNudge(state(h, [task('x', 'D', { doneFor: day(15) })]), at(15, 9), 'morning', prefs())).toBeNull();
    expect(pickNudge(state(h, tasks, lists), at(15, 9), 'morning', prefs({ off: ['plan'] }))).toBeNull();
    expect(pickNudge(state(h, tasks, lists), at(15, 9), 'morning', prefs(), { sent: { morning: day(15) } })).toBeNull();
    expect(pickNudge(state(null, tasks, lists), at(15, 9), 'morning', prefs())).toBeNull();
  });

  it('nudges a player who has been away, a few times at most', () => {
    const h = hero({ activeDays: [day(11), day(12)] });
    const n = pickNudge(state(h, tasks, lists), at(15, 9), 'morning', prefs())!;
    expect(n.kind).toBe('comeback');
    expect(n.body).toMatch(/^3 days without a quest, Aria\./);
    // after three of them it goes back to the plain plan, and a brand-new hero is never "away"
    expect(pickNudge(state(h, tasks, lists), at(15, 9), 'morning', prefs(), { comebacks: 3 })!.kind).toBe('plan');
    expect(pickNudge(state(h, tasks, lists), at(15, 9), 'morning', prefs({ off: ['comeback'] }))!.kind).toBe('plan');
    expect(pickNudge(state(hero(), tasks, lists), at(15, 9), 'morning', prefs())!.kind).toBe('plan');
  });
});

describe('evening reminder', () => {
  const shared = list('S', { type: 'supply', shared: true });

  it('saves a streak that is about to end', () => {
    const h = hero({ activeDays: [day(12), day(13), day(14)] });
    const n = pickNudge(state(h, [task('Read', 'D')]), at(15, 20), 'evening', prefs())!;
    expect(n.kind).toBe('streak');
    expect(n.title).toBe('🔥 Your 3-day streak is on the line');
    expect(n.body).toContain('1 quest waiting');
  });

  it("tells you what the party did today when you haven't played", () => {
    const h = hero({ activeDays: [day(14)] }); // a 1-day streak is not worth a streak warning
    const tasks = [
      task('Eggs', 'S', { repeat: { kind: 'none' }, doneFor: 'once', doneBy: 'Luna', doneAt: at(15, 11) }),
      task('Milk', 'S', { repeat: { kind: 'none' }, doneFor: 'once', doneBy: 'Luna', doneAt: at(15, 12) }),
      task('Old', 'S', { repeat: { kind: 'none' }, doneFor: 'once', doneBy: 'Bo', doneAt: at(14, 12) }),
    ];
    const n = pickNudge(state(h, tasks, [list('D', { type: 'daily' }), shared]), at(15, 20), 'evening', prefs())!;
    expect(n.kind).toBe('party');
    expect(n.title).toBe('👀 Luna finished 2 quests today');
    expect(pickNudge(state(h, tasks, [shared]), at(15, 20), 'evening', prefs({ off: ['party'] }))).toBeNull();
  });

  it('points at the dailies left once you have started, then at a boss nearly down', () => {
    const h = hero({ activeDays: [day(15)] });
    const n = pickNudge(state(h, [task('Read', 'D'), task('Walk', 'D'), task('Tax', 'Q', { repeat: { kind: 'none' }, due: day(15) })]), at(15, 20), 'evening', prefs())!;
    expect(n.kind).toBe('dailies');
    expect(n.title).toBe('🌙 2 daily quests left');
    const boss = bossFor(1);
    const weak = hero({ activeDays: [day(15)], bossDamage: { a: boss.maxHp - 3 } });
    const b = pickNudge(state(weak, [task('Tax', 'Q', { repeat: { kind: 'none' }, due: day(15) })]), at(15, 20), 'evening', prefs())!;
    expect(b.kind).toBe('boss');
    expect(b.title).toBe(`💀 ${boss.name} is down to 3 HP`);
  });

  it('stays quiet when all is done or evenings are switched off', () => {
    const h = hero({ activeDays: [day(13), day(14), day(15)] });
    expect(pickNudge(state(h, [task('Read', 'D', { doneFor: day(15) })]), at(15, 20), 'evening', prefs())).toBeNull();
    const lapsing = hero({ activeDays: [day(13), day(14)] });
    expect(pickNudge(state(lapsing, [task('Read', 'D')]), at(15, 20), 'evening', prefs({ off: ['evening', 'party'] }))).toBeNull();
  });

  it('follows the day start: at 1am with days starting at 4, it is still yesterday', () => {
    const h = hero({ activeDays: [day(12), day(13), day(14)] });
    const p = prefs({ dayStartHour: 4, eveningHour: 0 });
    // 1am on the 16th is still the 15th, which has not been played: the streak is at stake
    expect(pickNudge(state(h, [task('Read', 'D')]), at(16, 1), 'evening', p)!.kind).toBe('streak');
  });
});

describe('reminder history', () => {
  it('remembers the slot and counts comebacks until the player is back', () => {
    const away = state(hero({ activeDays: [day(11)] }), []);
    const sent = afterSlot({}, away, at(15, 9), 'morning', prefs(), { kind: 'comeback', title: '', body: '', tag: '', badge: 0 });
    expect(sent).toEqual({ sent: { morning: day(15) }, comebacks: 1 });
    const back = state(hero({ activeDays: [day(15)] }), []);
    expect(afterSlot(sent, back, at(15, 20), 'evening', prefs(), null)).toEqual({ sent: { morning: day(15) }, comebacks: 0 });
  });
});
