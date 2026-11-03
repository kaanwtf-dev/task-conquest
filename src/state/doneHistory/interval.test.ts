import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, visibleLists } from '../../state/store';
import type { Appearance } from '../../pixel/sprites/hero';
import { periodKey } from '../../core/time';
import { alarmsFor } from '../../push/alarms';
import { DEFAULT_PUSH_PREFS } from '../../push/nudges';

const app: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };
const st = () => useStore.getState();
const day = (n: number, h = 19) => vi.setSystemTime(new Date(2026, 8, 1 + n, h)); // n days after Sep 1

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  day(0, 8);
  st().resetAll();
  st().createHero('Kenny', app, 'mage');
  for (const t of Object.values(st().tasks)) st().deleteTask(t.id);
  useStore.setState((x) => ({ hero: { ...x.hero!, gold: { ...x.hero!.gold, test: 2000 } } }));
});
afterEach(() => vi.useRealTimers());

describe('every 2 days -> every 3 days (same anchor)', () => {
  it('periods after the change are not taken as done by older log entries', () => {
    const list = visibleLists(st()).find((l) => l.type === 'daily')!;
    st().addTask(list.id, 'Run');
    const id = Object.values(st().tasks).find((t) => t.title === 'Run' && !t.deleted)!.id;
    st().updateTask(id, { repeat: { kind: 'interval', every: 2, anchor: '2026-09-01' }, stakes: 'must' });
    for (let n = 0; n <= 60; n += 2) { day(n); st().toggleTask(id); st().checkDeadlines(); }
    expect(Object.keys(st().hero!.penalties ?? {})).toEqual([]);
    day(61, 9); // Nov 1: every 3 days from now on
    st().updateTask(id, { repeat: { kind: 'interval', every: 3, anchor: '2026-09-01' } });
    const task = st().tasks[id];
    // the next period under every 3 days
    day(64, 9);
    const next = periodKey(task.repeat, Date.now(), st().settings);
    const s = st();
    const alarms = alarmsFor({ hero: s.hero, lists: s.lists, tasks: s.tasks, accountId: s.accountId }, Date.now(), s.settings, DEFAULT_PUSH_PREFS).filter((a) => a.key.includes(id));
    // not done in that period: it is charged when it ends
    day(70, 9);
    st().checkDeadlines();
    expect((task.doneLog?.[next] ?? 0) > 0).toBe(false);
    expect(alarms.length).toBeGreaterThan(0);
  });
});
