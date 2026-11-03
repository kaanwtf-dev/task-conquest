import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, setup, wait, type Dev } from './harness';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

describe('doneLog merge once the log is full', () => {
  it('two synced devices converge after a tick (no endless re-merge)', async () => {
    at(9, 1, 8); // Oct 1
    const { server, P, M, id } = await setup();
    // a daily done every day for 17 days, on the phone, both devices online and syncing
    for (let d = 1; d <= 17; d++) {
      at(9, d, 20);
      P.st().toggleTask(id);
      await P.sync();
      await M.sync();
      await wait();
    }
    const log = (x: Dev) => JSON.stringify(x.st().tasks[id].doneLog);
    const stamps: number[] = [];
    for (let i = 0; i < 20; i++) {
      await P.sync();
      await M.sync();
      await wait();
      stamps.push(server.rows.get(id)!.updated_at);
    }
    // nothing changed for 20 rounds: the doc should be settled
    expect(new Set(stamps).size).toBe(1);
    expect(log(P)).toBe(log(M));
  });
});
