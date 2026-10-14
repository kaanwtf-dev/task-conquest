import { describe, expect, it } from 'vitest';
import type { Counter, Hero, SkillId, Task } from '../core/types';
import { Rng } from '../core/rng';
import { canon, DAYS_KEPT, lineage, mergeCounter, mergeHero, newer, resolveHero, sameDoc, unionSorted } from './merge';

const DEVICES = ['dev-a', 'dev-b', 'dev-c', 'dev-d'];
const SKILLS: SkillId[] = ['lore', 'smithing', 'athletics'];

function counter(rng: Rng): Counter {
  const c: Counter = {};
  for (const d of DEVICES) if (rng.chance(0.6)) c[d] = rng.int(0, 500);
  return c;
}

const day = (rng: Rng) => `2026-0${rng.int(1, 9)}-${String(rng.int(1, 28)).padStart(2, '0')}`;

function randomHero(rng: Rng, createdAt?: number): Hero {
  const skillXp: Hero['skillXp'] = {};
  for (const s of SKILLS) if (rng.chance(0.5)) skillXp[s] = counter(rng);
  const hero: Hero = {
    id: 'hero',
    name: rng.pick(['Ayla', 'Bram', 'Cyd']),
    appearance: {
      race: rng.pick(['human', 'elf', 'dwarf'] as const),
      skin: rng.int(0, 3),
      hair: 'short',
      hairColor: rng.pick(['#2a1e1a', '#d8a040']),
      eyes: '#3a5a9a',
      beard: 'none',
      outfit: rng.pick(['#3a6ad0', '#c0392b']),
      pants: '#3a3a4a',
    },
    classId: rng.pick(['knight', 'mage', 'ranger'] as const),
    xp: counter(rng),
    gold: counter(rng),
    goldSpent: counter(rng),
    kills: counter(rng),
    tasksDone: counter(rng),
    skillXp,
    activeDays: Array.from({ length: rng.int(0, 6) }, () => day(rng)),
    createdAt: createdAt ?? rng.int(1, 4) * 100,
    updatedAt: rng.int(1, 4) * 1000, // few distinct stamps so ties get exercised
    equipped: rng.chance(0.5) ? { weapon: `w${rng.int(1, 3)}` } : {},
    buffs: rng.chance(0.3) ? [{ id: 'b1', potion: 'insight', tier: 1, value: 10, remaining: rng.int(1, 5) }] : [],
    bagSize: rng.pick([24, 30, 36]),
    bossIndex: rng.int(1, 3),
    bossDamage: counter(rng),
    bossesSlain: counter(rng),
    itemsFound: counter(rng),
    potionsUsed: counter(rng),
    questsCleared: counter(rng),
    achievements: Object.fromEntries(['a1', 'a2', 'a3'].filter(() => rng.chance(0.5)).map((k) => [k, rng.int(1, 4)])),
    owned: ['theme:castle', 'dye:outfit:#ff00aa', 'theme:beach'].filter(() => rng.chance(0.4)),
    streakSaves: rng.int(0, 3),
    savedDays: Array.from({ length: rng.int(0, 3) }, () => day(rng)),
  };
  if (rng.chance(0.3)) hero.title = rng.pick(['the Brave', 'Slayer']);
  if (rng.chance(0.2)) hero.capeDye = '#00ff00';
  return hero;
}

const task = (id: string, updatedAt: number, extra: Partial<Task> = {}): Task => ({
  id, listId: 'L', title: id, difficulty: 2, repeat: { kind: 'none' }, order: 0, createdAt: 1, updatedAt, timesDone: 0, ...extra,
});

describe('canon / sameDoc', () => {
  it('ignores key order, undefined fields and a false deleted flag', () => {
    expect(canon({ b: 1, a: { d: [1, { y: 2, x: undefined }], c: null } })).toBe(canon({ a: { c: null, d: [1, { y: 2 }] }, b: 1 }));
    expect(sameDoc({ id: 'x', deleted: false, updatedAt: 1 }, { updatedAt: 1, id: 'x' })).toBe(true);
    expect(sameDoc({ id: 'x', deleted: true, updatedAt: 1 }, { updatedAt: 1, id: 'x' })).toBe(false);
    expect(sameDoc({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('survives a JSON round trip unchanged', () => {
    const rng = new Rng('canon');
    for (let i = 0; i < 50; i++) {
      const h = randomHero(rng);
      expect(canon(JSON.parse(JSON.stringify(h)))).toBe(canon(h));
    }
  });
});

describe('newer (last write wins)', () => {
  it('picks the higher updatedAt', () => {
    const a = task('t', 100, { title: 'old' });
    const b = task('t', 200, { title: 'new' });
    expect(newer(a, b)).toBe(b);
    expect(newer(b, a)).toBe(b);
  });

  it('breaks ties deterministically, whatever the argument order', () => {
    const a = task('t', 100, { title: 'apple' });
    const b = task('t', 100, { title: 'banana' });
    expect(newer(a, b)).toBe(newer(b, a));
    // tie-break is by canonical content, so key order does not matter
    const { updatedAt, title, ...rest } = b;
    const shuffled = JSON.parse(JSON.stringify({ updatedAt, title, ...rest })) as Task;
    expect(canon(newer(a, shuffled))).toBe(canon(b));
  });

  it('tombstones win when newer and lose to a later edit', () => {
    const live = task('t', 100);
    const dead = task('t', 150, { deleted: true });
    const revived = task('t', 200, { title: 'back' });
    expect(newer(live, dead).deleted).toBe(true);
    expect(newer(dead, live).deleted).toBe(true);
    expect(newer(dead, revived).deleted).toBeUndefined();
  });

  it('is associative over random docs', () => {
    const rng = new Rng('lww');
    for (let i = 0; i < 300; i++) {
      const [a, b, c] = [0, 1, 2].map(() => task('t', rng.int(1, 3), { title: rng.pick(['x', 'y', 'z']), deleted: rng.chance(0.3) || undefined }));
      expect(canon(newer(newer(a, b), c))).toBe(canon(newer(a, newer(b, c))));
    }
  });
});

describe('mergeCounter', () => {
  it('takes the per-device maximum', () => {
    expect(mergeCounter({ a: 5, b: 1 }, { b: 3, c: 2 })).toEqual({ a: 5, b: 3, c: 2 });
    expect(mergeCounter(undefined, { a: 1 })).toEqual({ a: 1 });
  });

  it('sanitizes junk and ignores prototype keys', () => {
    const evil = JSON.parse('{"__proto__": {"polluted": 1}, "a": "x", "b": 7}');
    const out = mergeCounter(evil, { constructor: 4 } as unknown as Counter);
    expect(out).toEqual({ a: 0, b: 7, constructor: 4 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('mergeHero CRDT laws', () => {
  it('is commutative', () => {
    const rng = new Rng('commutative');
    for (let i = 0; i < 400; i++) {
      const a = randomHero(rng);
      const b = randomHero(rng);
      expect(canon(mergeHero(a, b))).toBe(canon(mergeHero(b, a)));
    }
  });

  it('is associative', () => {
    const rng = new Rng('associative');
    for (let i = 0; i < 400; i++) {
      const [a, b, c] = [randomHero(rng), randomHero(rng), randomHero(rng)];
      expect(canon(mergeHero(mergeHero(a, b), c))).toBe(canon(mergeHero(a, mergeHero(b, c))));
    }
  });

  it('is idempotent', () => {
    const rng = new Rng('idempotent');
    for (let i = 0; i < 400; i++) {
      const a = randomHero(rng);
      const b = randomHero(rng);
      const m = mergeHero(a, b);
      expect(canon(mergeHero(m, m))).toBe(canon(m));
      expect(canon(mergeHero(m, a))).toBe(canon(m)); // absorbing an input changes nothing
      const self = mergeHero(a, a);
      expect(canon(mergeHero(self, a))).toBe(canon(self));
    }
  });

  it('converges whatever order replicas exchange states in', () => {
    const rng = new Rng('gossip');
    for (let round = 0; round < 60; round++) {
      const states = [randomHero(rng, 1), randomHero(rng, 1), randomHero(rng, 1), randomHero(rng, 1)];
      const expected = canon(states.reduce(mergeHero));
      const order = [...states].sort(() => rng.float() - 0.5);
      expect(canon(order.reduceRight(mergeHero))).toBe(expected);
    }
  });
});

describe('mergeHero semantics', () => {
  const base = (): Hero => randomHero(new Rng('base'), 1);

  it('adds up progress from every device instead of losing it', () => {
    const a = { ...base(), xp: { mac: 120 }, gold: { mac: 30 }, tasksDone: { mac: 4 }, updatedAt: 1000 };
    const b = { ...base(), xp: { phone: 80 }, gold: { phone: 10 }, tasksDone: { phone: 2 }, updatedAt: 2000 };
    const m = mergeHero(a, b);
    expect(m.xp).toEqual({ mac: 120, phone: 80 });
    expect(m.gold).toEqual({ mac: 30, phone: 10 });
    expect(m.tasksDone).toEqual({ mac: 4, phone: 2 });
  });

  it('merges skills per skill and device', () => {
    const a = { ...base(), skillXp: { lore: { mac: 5 } } };
    const b = { ...base(), skillXp: { lore: { mac: 3, phone: 2 }, smithing: { phone: 9 } } };
    expect(mergeHero(a, b).skillXp).toEqual({ lore: { mac: 5, phone: 2 }, smithing: { phone: 9 } });
  });

  it('unites day lists sorted and keeps only the last 400 days', () => {
    const days = (from: number, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2024, 0, 1 + from + i)).toISOString().slice(0, 10));
    const a = { ...base(), activeDays: days(0, 300), savedDays: ['2024-05-01'] };
    const b = { ...base(), activeDays: days(250, 300), savedDays: ['2024-01-03', '2024-05-01'] };
    const m = mergeHero(a, b);
    expect(m.activeDays).toHaveLength(DAYS_KEPT);
    expect(m.activeDays[m.activeDays.length - 1]).toBe(days(549, 1)[0]);
    expect([...m.activeDays].sort()).toEqual(m.activeDays);
    expect(m.savedDays).toEqual(['2024-01-03', '2024-05-01']);
  });

  it('unites owned unlocks and takes per-key max of achievements', () => {
    const a = { ...base(), owned: ['theme:castle'], achievements: { slayer: 2, hoarder: 1 } };
    const b = { ...base(), owned: ['dye:outfit:#ff00aa', 'theme:castle'], achievements: { slayer: 1, streak: 3 } };
    const m = mergeHero(a, b);
    expect(m.owned).toEqual(['dye:outfit:#ff00aa', 'theme:castle']);
    expect(m.achievements).toEqual({ slayer: 2, hoarder: 1, streak: 3 });
  });

  it('boss ladder: the further boss wins with its damage; a tie merges damage', () => {
    const a = { ...base(), bossIndex: 5, bossDamage: { mac: 10 } };
    const b = { ...base(), bossIndex: 4, bossDamage: { mac: 99, phone: 50 } };
    expect(mergeHero(a, b)).toMatchObject({ bossIndex: 5, bossDamage: { mac: 10 } });
    const c = { ...base(), bossIndex: 5, bossDamage: { phone: 7, mac: 3 } };
    expect(mergeHero(a, c)).toMatchObject({ bossIndex: 5, bossDamage: { mac: 10, phone: 7 } });
  });

  it('takes identity, gear and buffs from the newer side and max of bag / streak saves', () => {
    const a = { ...base(), name: 'Old', title: 'Slayer', equipped: { weapon: 'w1' }, bagSize: 36, streakSaves: 1, updatedAt: 1000 };
    const b = { ...base(), name: 'New', title: undefined, equipped: { weapon: 'w2' }, bagSize: 24, streakSaves: 3, updatedAt: 2000 };
    const m = mergeHero(a, b);
    expect(m.name).toBe('New');
    expect(m.title).toBeUndefined();
    expect(m.equipped).toEqual({ weapon: 'w2' });
    expect(m.bagSize).toBe(36);
    expect(m.streakSaves).toBe(3);
    expect(m.updatedAt).toBe(2000);
  });

  it('copes with heroes from older saves missing newer fields', () => {
    const full = base();
    const legacy = { ...full } as Partial<Hero>;
    delete legacy.bossDamage;
    delete legacy.savedDays;
    delete legacy.owned;
    delete legacy.achievements;
    const m = mergeHero(legacy as Hero, full);
    expect(m.savedDays).toEqual(unionSorted(full.savedDays, []));
    expect(m.bossDamage).toEqual(mergeCounter(full.bossDamage, undefined));
  });

  it('stays finite at absurd scales', () => {
    const a = { ...base(), bossIndex: 1e6, xp: { mac: 1e15 }, bossDamage: { mac: 1e12 } };
    const b = { ...base(), bossIndex: 999_999, xp: { phone: Number.POSITIVE_INFINITY } as Counter };
    const m = mergeHero(a, b);
    expect(m.bossIndex).toBe(1e6);
    expect(m.xp).toEqual({ mac: 1e15, phone: 0 });
    expect(Number.isFinite(m.createdAt)).toBe(true);
  });
});

describe('resolveHero (lineage)', () => {
  it('merges heroes of the same lineage', () => {
    const rng = new Rng('lineage');
    const a = randomHero(rng, 500);
    const b = randomHero(rng, 500);
    expect(canon(resolveHero(a, b))).toBe(canon(mergeHero(a, b)));
  });

  it('is commutative and associative in whatever order copies meet, even with a missing createdAt', () => {
    const rng = new Rng('lineage-laws');
    const make = () => {
      const h = randomHero(rng, rng.pick([100, 200, 200]));
      if (rng.chance(0.3)) delete (h as Partial<Hero>).createdAt; // legacy / malformed save
      return h;
    };
    for (let i = 0; i < 400; i++) {
      const [a, b, c] = [make(), make(), make()];
      expect(canon(resolveHero(a, b))).toBe(canon(resolveHero(b, a)));
      expect(canon(resolveHero(resolveHero(a, b), c))).toBe(canon(resolveHero(a, resolveHero(b, c))));
      expect(lineage(resolveHero(a, b))).toBe(Math.max(lineage(a), lineage(b)));
    }
  });

  it('keeps the progress of every copy when createdAt is missing on all of them', () => {
    const rng = new Rng('legacy');
    const [a, b, c] = [randomHero(rng), randomHero(rng), randomHero(rng)].map((h, i) => {
      const x = { ...h, xp: { [`dev${i}`]: 10 * (i + 1) } } as Partial<Hero>;
      delete x.createdAt;
      return x as Hero;
    });
    const all = resolveHero(resolveHero(a, b), c);
    expect(all.xp).toEqual({ dev0: 10, dev1: 20, dev2: 30 });
    expect(Number.isFinite(all.createdAt)).toBe(true);
  });

  it('lets the newest lineage replace an older one wholesale, even if the older was edited later', () => {
    const rng = new Rng('lineage2');
    const old = { ...randomHero(rng, 500), updatedAt: 9000, xp: { mac: 5000 } };
    const reborn = { ...randomHero(rng, 800), updatedAt: 1000, xp: { phone: 1 } };
    expect(resolveHero(old, reborn)).toBe(reborn);
    expect(resolveHero(reborn, old)).toBe(reborn);
  });
});

describe('mergeHero bestStreak', () => {
  it('keeps the longest streak either device has seen, and stays absent when neither has one', () => {
    const rng = new Rng(42);
    const a = { ...randomHero(rng, 1000), bestStreak: 400 };
    const b = { ...randomHero(rng, 1000), bestStreak: 30 };
    expect(mergeHero(a, b).bestStreak).toBe(400);
    expect(mergeHero(b, a).bestStreak).toBe(400);
    const c = randomHero(rng, 1000);
    const d = randomHero(rng, 1000);
    delete (c as Partial<Hero>).bestStreak;
    delete (d as Partial<Hero>).bestStreak;
    expect('bestStreak' in mergeHero(c, d)).toBe(false);
  });
});
