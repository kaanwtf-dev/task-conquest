import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, bagItems, potionStacks, listTasks, visibleLists } from './store';
import { fx, type FxEvent } from './fx';
import { sum, heroGold } from '../game/progression';
import { bossFor } from '../game/bosses';
import type { Appearance } from '../pixel/sprites/hero';

const app: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };

function fresh(classId: 'knight' | 'mage' = 'knight') {
  useStore.getState().resetAll();
  useStore.getState().createHero('Tester', app, classId);
}
const st = () => useStore.getState();
const listOf = (type: string) => visibleLists(st()).find((l) => l.type === type)!;

describe('store: hero creation', () => {
  beforeEach(() => fresh());

  it('equips the class starter kit', () => {
    const h = st().hero!;
    expect(h.equipped.weapon).toBeTruthy();
    expect(st().items[h.equipped.weapon!].base).toBe('sword');
    expect(h.equipped.offhand).toBeTruthy();
    expect(bagItems(st())).toHaveLength(0);
  });

  it('seeds default lists of every kind', () => {
    const types = visibleLists(st()).map((l) => l.type).sort();
    expect(types).toEqual(['daily', 'quests', 'supply', 'weekly']);
  });
});

describe('store: completing tasks', () => {
  beforeEach(() => fresh());

  it('grants XP, gold and a kill', () => {
    const events: FxEvent[] = [];
    const off = fx.on((e) => events.push(e));
    const daily = listOf('daily');
    const t = listTasks(st(), daily.id)[0];
    st().toggleTask(t.id);
    off();
    const h = st().hero!;
    expect(sum(h.xp)).toBeGreaterThan(0);
    expect(heroGold(h)).toBeGreaterThan(0);
    expect(sum(h.kills)).toBe(1);
    expect(events.some((e) => e.type === 'kill')).toBe(true);
    expect(events.some((e) => e.type === 'bossHit')).toBe(true);
  });

  it('toggling off and on again in the same period never pays twice', () => {
    const t = listTasks(st(), listOf('daily').id)[0];
    st().toggleTask(t.id);
    const xp1 = sum(st().hero!.xp);
    st().toggleTask(t.id); // uncheck
    st().toggleTask(t.id); // re-check
    expect(sum(st().hero!.xp)).toBe(xp1);
    expect(sum(st().hero!.kills)).toBe(1);
  });

  it('clearing a whole list awards a quest chest', () => {
    const daily = listOf('daily');
    for (const t of listTasks(st(), daily.id)) st().toggleTask(t.id);
    expect(sum(st().hero!.questsCleared)).toBe(1);
    expect(sum(st().hero!.itemsFound)).toBeGreaterThan(0);
  });

  it('supply items can be bought again after re-adding and pay out again', () => {
    const g = listOf('supply');
    const milk = listTasks(st(), g.id).find((t) => t.title === 'Milk')!;
    st().toggleTask(milk.id);
    const k1 = sum(st().hero!.kills);
    st().addTask(g.id, 'milk'); // known item: back on the list, not duplicated
    expect(listTasks(st(), g.id).filter((t) => t.title.toLowerCase() === 'milk')).toHaveLength(1);
    expect(st().tasks[milk.id].doneFor).toBeNull();
    st().toggleTask(milk.id);
    expect(sum(st().hero!.kills)).toBe(k1 + 1);
    expect(st().tasks[milk.id].timesDone).toBe(2);
  });

  it('chips at the boss and eventually defeats it', () => {
    const side = listOf('quests');
    const maxHp = bossFor(1).maxHp;
    let guard = 0;
    while (st().hero!.bossIndex === 1 && guard++ < 200) {
      const id = st().addTask(side.id, `grind ${guard}`, { difficulty: 4 })!;
      st().toggleTask(id);
    }
    expect(st().hero!.bossIndex).toBe(2);
    expect(sum(st().hero!.bossesSlain)).toBe(1);
    expect(guard).toBeLessThan(200);
    expect(maxHp).toBeGreaterThan(0);
  });

  it('auto-sells drops when the bag is full', () => {
    useStore.setState({ hero: { ...st().hero!, bagSize: 0 } });
    const side = listOf('quests');
    for (let i = 0; i < 80; i++) st().toggleTask(st().addTask(side.id, `loot ${i}`, { difficulty: 4 })!);
    expect(bagItems(st())).toHaveLength(0);
    expect(sum(st().hero!.itemsFound)).toBeGreaterThan(0);
  });
});

describe('store: economy actions', () => {
  beforeEach(() => fresh());

  const rich = (g: number) => useStore.setState({ hero: { ...st().hero!, gold: { [st().deviceId]: g } } });

  it('refuses to sell equipped or locked items', () => {
    const h = st().hero!;
    expect(st().sellItem(h.equipped.weapon!)).toBe(0);
  });

  it('buys and drinks a potion, and the buff ticks down per quest', () => {
    rich(100000);
    st().buyOffer({ id: 'p', kind: 'potion', label: 'Potion', price: 10, potion: { potion: 'insight', tier: 1 } });
    const stack = potionStacks(st())[0];
    expect(stack.count).toBe(1);
    expect(st().usePotion(stack.id)).toBe(true);
    expect(potionStacks(st())).toHaveLength(0); // checked before questing: kills can drop new potions
    const buff = st().hero!.buffs[0];
    expect(buff.remaining).toBeGreaterThan(0);
    st().toggleTask(listTasks(st(), listOf('quests').id)[0].id);
    expect(st().hero!.buffs.find((b) => b.id === buff.id)?.remaining ?? 0).toBe(buff.remaining - 1);
  });

  it('blacksmith upgrades cost gold', () => {
    rich(100000);
    const w = st().hero!.equipped.weapon!;
    const g0 = heroGold(st().hero!);
    expect(st().upgradeItem(w)).toBe(true);
    expect(st().items[w].upgrade).toBe(1);
    expect(heroGold(st().hero!)).toBeLessThan(g0);
  });

  it('cannot spend gold it does not have', () => {
    rich(0);
    expect(st().buyOffer({ id: 'b', kind: 'bag', label: 'Bag', price: 50 })).toBe(false);
    expect(st().hero!.bagSize).toBe(24);
  });

  it('export / import round-trips', () => {
    st().toggleTask(listTasks(st(), listOf('daily').id)[0].id);
    const json = st().exportData();
    const xp = sum(st().hero!.xp);
    st().resetAll();
    expect(st().hero).toBeNull();
    expect(visibleLists(st())).toHaveLength(0); // tombstoned, so the deletion can sync
    expect(st().importData(json)).toBe(true);
    expect(sum(st().hero!.xp)).toBe(xp);
    expect(st().importData('{"nope":1}')).toBe(false);
  });
});

describe('store: start over + moves', () => {
  beforeEach(() => fresh());

  it('start over tombstones everything and a new hero gets fresh lists', () => {
    const before = Object.keys(st().lists).length;
    st().resetAll();
    expect(Object.values(st().lists).every((l) => l.deleted)).toBe(true);
    expect(Object.values(st().items).every((i) => i.deleted)).toBe(true);
    st().createHero('Again', app, 'mage');
    expect(visibleLists(st())).toHaveLength(4);
    expect(Object.keys(st().lists).length).toBe(before + 4);
  });

  it('moving a task across a shared list boundary re-creates it', () => {
    const side = listOf('quests');
    const daily = listOf('daily');
    st().updateList(side.id, { shared: true });
    const t = listTasks(st(), side.id)[0];
    st().moveTask(t.id, daily.id);
    expect(st().tasks[t.id].deleted).toBe(true);
    expect(listTasks(st(), daily.id).some((x) => x.title === t.title && x.id !== t.id)).toBe(true);
  });
});
