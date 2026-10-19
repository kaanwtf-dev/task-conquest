import { describe, expect, it } from 'vitest';
import type { Hero, Task, TaskList } from '../core/types';
import { dateKey } from '../core/time';
import { DAY_CAP, dayPoints, rankBoard } from './leaderboard';

const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
const cfg = { dayStartHour: 0, weekStart: 1 };
const hero = { name: 'Aria' } as Hero;
const list = (id: string, extra: Partial<TaskList> = {}) => ({ id, name: id, type: 'quests', ...extra }) as TaskList;
const lists = { Q: list('Q'), D: list('D', { type: 'daily' }), G: list('G', { type: 'supply' }), S: list('S', { shared: true }) };
let n = 0;
const done = (listId: string, difficulty: number, extra: Partial<Task> = {}): Task =>
  ({ id: `t${n++}`, listId, title: 'x', difficulty, repeat: { kind: 'none' }, doneFor: 'once', doneAt: at(15, 10), doneBy: 'Aria', ...extra }) as Task;
const map = (ts: Task[]) => Object.fromEntries(ts.map((t) => [t.id, t]));

describe('leaderboard points', () => {
  it('scores the day by difficulty, leaving out groceries, other days and party members', () => {
    const tasks = [
      done('Q', 4), // 5
      done('Q', 2), // 2
      done('Q', 0), // trivial: 0
      done('G', 4), // groceries never count
      done('Q', 4, { doneAt: at(14, 10) }), // yesterday
      done('S', 3), // mine on a party list: 3
      done('S', 3, { doneBy: 'Luna' }), // theirs
      done('D', 2, { repeat: { kind: 'daily' }, doneFor: dateKey(new Date(2026, 9, 15)), again: { period: dateKey(new Date(2026, 9, 15)), n: 2 } }), // 2 + 1 + 1
    ];
    expect(dayPoints(hero, lists, map(tasks), dateKey(new Date(2026, 9, 15)), cfg)).toBe(14);
  });

  it('caps a day, however many quests are made up', () => {
    const tasks = Array.from({ length: 50 }, () => done('Q', 4));
    expect(dayPoints(hero, lists, map(tasks), dateKey(new Date(2026, 9, 15)), cfg)).toBe(DAY_CAP);
  });

  it('ranks by points, then by days played; ties share a place', () => {
    const r = rankBoard([
      { userId: 'a', name: 'Aria', points: 40, days: 3 },
      { userId: 'b', name: 'Bo', points: 40, days: 5 },
      { userId: 'c', name: 'Cy', points: 12, days: 2 },
      { userId: 'd', name: 'Di', points: 12, days: 2 },
      { userId: 'e', name: 'Ed', points: 0, days: 0 },
    ]);
    expect(r.map((x) => `${x.rank}${x.name}`)).toEqual(['1Bo', '2Aria', '3Cy', '3Di', '5Ed']);
  });
});
