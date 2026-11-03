// weekly -> daily on the phone; the Mac (holding the old weekly log) merges it back on its next sync.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setup, wait } from './harness';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

const day = (m: number, d: number, h: number, mi = 0) => vi.setSystemTime(new Date(2026, m, d, h, mi));

describe('repeat change with a second device', () => {
  it('weekly done for months -> daily: days done every day are never charged', async () => {
    day(5, 29, 8); // Mon Jun 29
    const { P, M, id } = await setup('Tidy up');
    day(5, 29, 8, 5);
    P.st().updateTask(id, { repeat: { kind: 'weekly' }, stakes: 'flexible' });
    await P.sync(); await M.sync();
    // done every Wednesday for 18 weeks, both devices syncing
    for (let w = 0; w < 18; w++) {
      vi.setSystemTime(new Date(2026, 6, 1 + w * 7, 19));
      P.st().toggleTask(id);
      await P.sync(); P.st().checkDeadlines();
      await M.sync(); M.st().checkDeadlines();
      await wait();
    }
    expect({ ...P.st().hero!.penalties }).toEqual({});
    const before = Object.keys(P.st().tasks[id].doneLog ?? {});
    // Tue Nov 3: from now on every day (from the edit sheet: only the changed field)
    day(10, 3, 20);
    P.st().updateTask(id, { repeat: { kind: 'daily' } });
    P.st().toggleTask(id); // and done today
    await P.sync(); P.st().checkDeadlines();
    await M.sync(); M.st().checkDeadlines();
    await P.sync(); P.st().checkDeadlines();
    const logAfterChange = P.st().tasks[id].doneLog;
    // the weekly periods are gone for good, also after the Mac (which still had them) synced
    expect(before.some((k) => k.startsWith('w'))).toBe(true);
    expect(Object.keys(logAfterChange ?? {}).filter((k) => k.startsWith('w'))).toEqual([]);
    // done every day after that, on the phone; both devices sync and check after each sync
    for (let d = 4; d <= 9; d++) {
      day(10, d, 9);
      P.st().toggleTask(id);
      for (let i = 0; i < 2; i++) {
        await P.sync(); P.st().checkDeadlines();
        await M.sync(); M.st().checkDeadlines();
        await wait();
      }
    }
    const pens = { ...P.st().hero!.penalties, ...M.st().hero!.penalties };
    expect(pens).toEqual({});
  });
});
