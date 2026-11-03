// every 2 days -> every 3 days (the edit sheet keeps the anchor); the Mac merges the old log back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setup, wait } from './harness';
import { alarmsFor } from '../../push/alarms';
import { DEFAULT_PUSH_PREFS } from '../../push/nudges';
import { periodKey } from '../../core/time';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

const day = (n: number, h = 19) => vi.setSystemTime(new Date(2026, 8, 1 + n, h)); // n days after Sep 1

describe('interval change with a second device', () => {
  it('periods after the change are charged when missed, and get their alarms', async () => {
    day(0, 8);
    const { P, M, id } = await setup('Run');
    day(0, 9);
    P.st().updateTask(id, { repeat: { kind: 'interval', every: 2, anchor: '2026-09-01' }, stakes: 'must' });
    await P.sync(); await M.sync();
    for (let n = 0; n <= 20; n += 2) {
      day(n);
      P.st().toggleTask(id);
      await P.sync(); P.st().checkDeadlines();
      await M.sync(); M.st().checkDeadlines();
      await wait();
    }
    expect({ ...P.st().hero!.penalties }).toEqual({});
    day(21, 9); // Sep 22: every 3 days from now on (same anchor)
    const r = P.st().tasks[id].repeat as { kind: 'interval'; every: number; anchor: string };
    P.st().updateTask(id, { repeat: { ...r, every: 3 } });
    await P.sync(); P.st().checkDeadlines();
    await M.sync(); M.st().checkDeadlines();
    await P.sync(); P.st().checkDeadlines();
    const task = P.st().tasks[id];
    // Sep 22 - 24 is done (the tick of Sep 21 carries over into the period the change lands in); the next
    // one, Sep 25 - 27, is not done: alarms planned for it on Sep 25
    day(24, 9);
    const s = P.st();
    const next = periodKey(task.repeat, Date.now(), s.settings);
    const alarms = alarmsFor({ hero: s.hero, lists: s.lists, tasks: s.tasks, accountId: s.accountId }, Date.now(), s.settings, DEFAULT_PUSH_PREFS).filter((a) => a.key.includes(id));
    expect((task.doneLog?.[next] ?? 0) > 0).toBe(false);
    // two weeks of nothing, checking every day
    for (let n = 22; n <= 36; n++) {
      day(n, 12);
      await P.sync(); P.st().checkDeadlines();
      await M.sync(); M.st().checkDeadlines();
      await wait();
    }
    const pens = Object.keys({ ...P.st().hero!.penalties, ...M.st().hero!.penalties }).map((k) => new Date(Number(k.split('@')[1])).toString().slice(0, 15));
    expect(alarms.length).toBeGreaterThan(0);
    expect(pens.length).toBeGreaterThanOrEqual(4);
  });
});
