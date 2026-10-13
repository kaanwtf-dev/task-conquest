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
    const news = partyNews(before, { tasks: { ...before.tasks, t1: task('t1', 'S', { doneFor: 'once', doneBy: 'Bo', updatedAt: 9 }) } });
    expect(news).toHaveLength(1);
    expect(news[0].text).toBe('Bo completed "t1" in S');
    expect(news[0].log).toBeTruthy();
  });

  it('a first pull or a join is not news: tasks never seen here are not "just completed"', () => {
    const before = { hero, lists, tasks: {} };
    const pulled = { a: task('a', 'S', { doneFor: 'once', doneBy: 'Bo', createdBy: 'Bo' }), b: task('b', 'S', { createdBy: 'Bo' }) };
    const news = partyNews(before, { tasks: pulled });
    // completions are dropped; a fresh addition by someone else is toasted but never logged
    expect(news.map((n) => n.text)).toEqual(['Bo added "b" to S']);
    expect(news.every((n) => !n.log)).toBe(true);
  });

  it('ignores my own actions, private lists and deletions', () => {
    const before = { hero, lists, tasks: { t1: task('t1', 'S'), p1: task('p1', 'P'), t2: task('t2', 'S') } };
    const news = partyNews(before, {
      tasks: {
        t1: task('t1', 'S', { doneFor: 'once', doneBy: 'Ayla' }),
        p1: task('p1', 'P', { doneFor: 'once', doneBy: 'Bo' }),
        t2: task('t2', 'S', { doneFor: 'once', doneBy: 'Bo', deleted: true }),
      },
    });
    expect(news).toEqual([]);
  });
});

describe('bringing a device into another account', () => {
  it('re-keys own lists and tasks, drops party lists and tombstones', () => {
    let n = 0;
    const s = {
      activeListId: 'L1',
      lists: { L1: list('L1'), S: list('S', { shared: true, ownerId: 'u-a' }), J: list('J', { shared: true, ownerId: 'u-bo' }), D: list('D', { deleted: true }) },
      tasks: { t1: task('t1', 'L1'), t2: task('t2', 'S'), t3: task('t3', 'L1', { deleted: true }), t4: task('t4', 'D') },
    };
    const out = rekeyOwnData(s, 50, () => `new${++n}`);
    expect(Object.keys(out.lists)).toEqual(['new1']);
    expect(out.lists.new1).toMatchObject({ id: 'new1', name: 'L1', updatedAt: 50 });
    expect(Object.values(out.tasks)).toEqual([expect.objectContaining({ id: 'new2', listId: 'new1', title: 't1', updatedAt: 50 })]);
    expect(out.activeListId).toBe('new1');
  });
});
