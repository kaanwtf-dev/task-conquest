import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, setup, wait } from './harness';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

describe('a tick taken back while the other device is offline', () => {
  it('a day really missed stays charged', async () => {
    at(9, 26, 8);
    const { P, M, id } = await setup('Take meds');
    at(9, 26, 8, 5);
    P.st().updateTask(id, { stakes: 'must' });
    for (let d = 26; d <= 27; d++) { at(9, d, 12); P.st().toggleTask(id); await P.sync(); await M.sync(); await wait(); }
    at(9, 28, 12);
    P.st().toggleTask(id); // by mistake
    await P.sync(); await M.sync(); await wait(); // the Mac has it
    M.remote.online = false; // the Mac goes offline
    at(9, 28, 12, 1);
    P.st().toggleTask(id); // taken back; never done on the 28th
    await P.sync();
    at(9, 29, 9);
    P.st().checkDeadlines(); // the 28th: charged
    expect(Object.keys(P.st().hero!.penalties ?? {})).toHaveLength(1);
    P.st().toggleTask(id); // done on the 29th
    await P.sync();
    M.remote.online = true;
    await M.sync(); await P.sync(); await M.sync(); await P.sync();
    P.st().checkDeadlines();
    expect(P.st().tasks[id].doneLog).not.toContain('2026-10-28');
    expect(Object.keys(P.st().hero!.refunds ?? {})).toHaveLength(0);
  });
});
