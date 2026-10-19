import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../i18n';
import type { Appearance } from '../pixel/sprites/hero';
import { listTasks, useStore, visibleLists } from './store';

const app: Appearance = { race: 'human', skin: 0, hair: 'short', hairColor: '#5a3a22', eyes: '#3a5a9a', beard: 'none', outfit: '#3a6ad0', pants: '#4a3a2a' };

describe('a new hero in Turkish', () => {
  afterEach(() => setLang('en'));

  it('starts with Turkish lists, quests and groceries, and a Turkish log line', () => {
    setLang('tr');
    useStore.getState().resetAll();
    useStore.getState().createHero('Ayşe', app, 'knight');
    const s = useStore.getState();
    expect(visibleLists(s).map((l) => l.name)).toEqual(['Günlük Görevler', 'Haftalık Görevler', 'Yan Görevler', 'Market']);
    const daily = visibleLists(s)[0];
    expect(listTasks(s, daily.id).map((x) => x.title)).toContain('Su iç');
    const market = visibleLists(s)[3];
    const milk = listTasks(s, market.id).find((x) => x.title === 'Süt')!;
    expect(milk.staple).toBe(true);
    expect(milk.aisle).not.toBe('other'); // the aisle is still guessed from the English name
    expect(s.log[0].text).toBe('Ayşe maceraya atılıyor!');
  });
});
