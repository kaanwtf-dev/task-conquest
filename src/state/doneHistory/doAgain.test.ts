// Ticked on the phone (the Mac hears of it), taken back on the phone; the Mac, not synced since, shows it done
// and "Do again" is tapped there. After syncing: shown done everywhere, but charged / alarmed as not done?
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setup, wait } from './harness';
import { isDone } from '../../core/time';
import { alarmsFor } from '../../push/alarms';
import { DEFAULT_PUSH_PREFS } from '../../push/nudges';

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());
const day = (m: number, d: number, h: number, mi = 0) => vi.setSystemTime(new Date(2026, m, d, h, mi));

describe('do again on a copy that missed an untick', () => {
  it('shown done = not charged', async () => {
    day(9, 26, 8);
    const { P, M, id } = await setup('Stretch');
    day(9, 26, 8, 5);
    P.st().updateTask(id, { stakes: 'must', byTime: '21:00' });
    await P.sync(); await M.sync();
    day(9, 28, 9);
    P.st().toggleTask(id);
    await P.sync(); await M.sync(); await wait();
    day(9, 28, 9, 1);
    P.st().toggleTask(id); // taken back on the phone
    M.remote.online = false; // the Mac doesn't hear of it yet
    await P.sync();
    day(9, 28, 12);
    expect(M.st().repeatTask(id)).toBe(true); // "Do again" on the Mac (it still shows it done)
    M.remote.online = true;
    for (let i = 0; i < 3; i++) { await M.sync(); await P.sync(); await wait(); }
    const s = P.st();
    const t = s.tasks[id];
    const shown = isDone(t, Date.now(), s.settings);
    const keys = alarmsFor({ hero: s.hero, lists: s.lists, tasks: s.tasks, accountId: s.accountId }, Date.now(), s.settings, DEFAULT_PUSH_PREFS).map((a) => a.key).filter((k) => k.startsWith('missed'));
    day(9, 29, 9);
    P.st().checkDeadlines();
    const pens = Object.keys(P.st().hero!.penalties ?? {});
    expect(shown && pens.length > 0).toBe(false);
    // no "time's up" for today's window (Oct 28, 21:00); the days after it are not done yet and keep theirs
    const today = new Date(2026, 9, 28, 21).getTime();
    expect(shown && keys.some((k) => k.endsWith(`@${today}`))).toBe(false);
  });
});
