import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, setup, wait } from './harness';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

describe('realtime only (no pulls): one tick once the log is full', () => {
  it('settles', async () => {
    at(9, 1, 8);
    const { server, P, M, id } = await setup();
    for (let d = 1; d <= 16; d++) { at(9, d, 20); P.st().toggleTask(id); await P.sync(); await M.sync(); await wait(); }
    at(9, 17, 20);
    P.st().toggleTask(id);
    await P.engine.start(); await M.engine.start(); server.deliver(); await wait(20);
    const push = (x: typeof P) => (x.engine as unknown as { request(pull: boolean): Promise<void> }).request(false);
    await push(P);
    const before = P.remote.pushCalls + M.remote.pushCalls;
    for (let i = 0; i < 30; i++) { server.deliver(); await wait(10); } // realtime events + the debounced pushes they cause
    const pushes = P.remote.pushCalls + M.remote.pushCalls - before;
    expect(pushes).toBeLessThan(4);
  });
});
