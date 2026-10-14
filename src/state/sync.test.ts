import { describe, expect, it } from 'vitest';
import type { Task, TaskList } from '../core/types';
import { partyNews, rekeyOwnData } from './sync';

const list = (id: string, extra: Partial<TaskList> = {}): TaskList =>
  ({ id, name: id, type: 'supply', theme: 'tavern', skill: 'mercantile', order: 0, createdAt: 1, updatedAt: 1, ...extra }) as TaskList;
const task = (id: string, listId: string, extra: Partial<Task> = {}): Task =>
  ({ id, listId, title: id, difficulty: 1, repeat: { kind: 'none' }, order: 0, createdAt: 1, updatedAt: 1, doneFor: null, ...extra }) as Task;

describe('party news', () => {
  const lists = { S: list('S', { shared: true, ownerId: 'u-bo' }), P: list('P') };
  const hero = { name: 'Ayla' } as never;

  it('announces what others did to tasks this device already had', () => {
    const before = { hero, lists, tasks: { t1: task('t1', 'S') } };
    const news = partyNews(before, { tasks: { ...before.tasks, t1: task('t1', 'S', { doneFor: 'once', doneBy: 'Bo', timesDone: 1, doneAt: 9, updatedAt: 9 }) } });
    expect(news).toHaveLength(1);
    expect(news[0].text).toBe('Bo completed "t1" in S');
    expect(news[0].log).toBeTruthy();
  });

  it('a grocery put back in the pantry without buying it is not a completion', () => {
    // Bo bought it last week; someone just took it off the list again, unbought
    const before = { hero, lists, tasks: { t1: task('t1', 'S', { doneBy: 'Bo', timesDone: 1, doneAt: 5 }) } };
    const back = task('t1', 'S', { doneFor: 'once', doneBy: 'Bo', timesDone: 1, doneAt: 5, updatedAt: 9 });
    expect(partyNews(before, { tasks: { t1: back } })).toEqual([]);
  });

  it('a purchase is news even when this device counted more purchases than the buyer had seen', () => {
    const before = { hero, lists, tasks: { t1: task('t1', 'S', { doneBy: 'Ayla', timesDone: 3, doneAt: 5 }) } };
    const bought = task('t1', 'S', { doneFor: 'once', doneBy: 'Bo', timesDone: 3, doneAt: 8, updatedAt: 9 });
    expect(partyNews(before, { tasks: { t1: bought } }).map((n) => n.text)).toEqual(['Bo completed "t1" in S']);
  });

  it('tasks never seen here: a completion is not news, a new open task in a known list is (toast only)', () => {
    const before = { hero, lists, tasks: {} };
    const pulled = { a: task('a', 'S', { doneFor: 'once', doneBy: 'Bo', createdBy: 'Bo' }), b: task('b', 'S', { createdBy: 'Bo' }) };
    const news = partyNews(before, { tasks: pulled });
    expect(news.map((n) => n.text)).toEqual(['Bo added "b" to S']);
    expect(news.every((n) => !n.log)).toBe(true);
  });

  it('a list arriving whole (joined here or on another device) is not news', () => {
    const before = { hero, lists: { P: lists.P }, tasks: {} };
    const pulled = { a: task('a', 'S', { createdBy: 'Bo' }), b: task('b', 'S', { createdBy: 'Bo' }) };
    expect(partyNews(before, { lists, tasks: pulled })).toEqual([]);
  });

  it('ignores my own actions, private lists and deletions', () => {
    const before = { hero, lists, tasks: { t1: task('t1', 'S'), p1: task('p1', 'P'), t2: task('t2', 'S') } };
    const news = partyNews(before, {
      tasks: {
        t1: task('t1', 'S', { doneFor: 'once', doneBy: 'Ayla', timesDone: 1, doneAt: 9 }),
        p1: task('p1', 'P', { doneFor: 'once', doneBy: 'Bo', timesDone: 1, doneAt: 9 }),
        t2: task('t2', 'S', { doneFor: 'once', doneBy: 'Bo', timesDone: 1, doneAt: 9, deleted: true }),
      },
    });
    expect(news).toEqual([]);
  });
});

describe('bringing a device into another account', () => {
  it('re-keys own lists and tasks, brings shared ones as private copies, drops joined lists and tombstones', () => {
    let n = 0;
    const s = {
      activeListId: 'L1',
      lists: { L1: list('L1'), S: list('S', { shared: true, ownerId: 'u-a' }), J: list('J', { shared: true, ownerId: 'u-bo' }), D: list('D', { deleted: true }) },
      tasks: { t1: task('t1', 'L1'), t2: task('t2', 'S'), t3: task('t3', 'L1', { deleted: true }), t4: task('t4', 'D'), t5: task('t5', 'J') },
    };
    const out = rekeyOwnData(s, 50, 'u-a', () => `new${++n}`);
    expect(Object.values(out.lists).map((l) => l.name)).toEqual(['L1', 'S']);
    expect(out.lists.new1).toMatchObject({ id: 'new1', name: 'L1', updatedAt: 50 });
    expect(out.lists.new2.shared).toBeUndefined();
    expect(out.lists.new2.ownerId).toBeUndefined();
    expect(Object.values(out.tasks).map((t) => [t.title, out.lists[t.listId].name])).toEqual([
      ['t1', 'L1'],
      ['t2', 'S'],
    ]);
    expect(out.activeListId).toBe('new1');
  });
});
