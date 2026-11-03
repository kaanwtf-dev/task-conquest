import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, setup, wait } from './harness';
import { alarmsFor } from '../../push/alarms';
import { DEFAULT_PUSH_PREFS } from '../../push/nudges';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

describe('a tick taken back, with a second device online', () => {
  it('stays taken back: the day is charged if it was never done, and its alarms are still planned', async () => {
    at(9, 26, 8);
    const { P, M, id } = await setup('Take meds');
    at(9, 26, 8, 5);
    P.st().updateTask(id, { byTime: '21:30', stakes: 'must' });
    await P.sync(); await M.sync();
    at(9, 28, 12);
    P.st().toggleTask(id); // ticked by mistake at noon
    await P.sync(); await M.sync(); await wait(); // the Mac gets the tick
    at(9, 28, 12, 1);
    P.st().toggleTask(id); // taken back a minute later
    await (P.engine as unknown as { request(pull: boolean): Promise<void> }).request(false); // the app's debounced push: no pull
    for (let i = 0; i < 3; i++) { await M.sync(); await P.sync(); await wait(); }
    const t = P.st().tasks[id];
    const plan = P.st();
    const keys = alarmsFor({ hero: plan.hero, lists: plan.lists, tasks: plan.tasks, accountId: plan.accountId }, Date.now(), plan.settings, DEFAULT_PUSH_PREFS).map((a) => a.key);
    const end = new Date(2026, 9, 28, 21, 30).getTime();
    // never done on the 28th
    at(9, 28, 22);
    P.st().checkDeadlines();
    await P.sync(); await M.sync();
    at(9, 29, 9);
    P.st().checkDeadlines();
    const pens = Object.keys(P.st().hero!.penalties ?? {});
    expect(t.doneLog ?? []).not.toContain('2026-10-28');
    expect(keys).toContain(`warn:${id}@${end}`);
    expect(keys).toContain(`missed:${id}@${end}`);
    expect(pens).toEqual([`${id}@${end}`]);
  });
});
