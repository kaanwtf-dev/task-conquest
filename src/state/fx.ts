// Fire-and-forget event bus for visual effects (battles, level ups, loot toasts).
import type { MonsterSpawn } from '../game/catalog';
import type { Item, PotionId } from '../core/types';

export type FxEvent =
  | { type: 'kill'; monster: MonsterSpawn; xp: number; gold: number; crit: boolean; theme: string; listId: string }
  | { type: 'levelUp'; level: number }
  | { type: 'skillUp'; skill: string; level: number }
  | { type: 'questComplete'; listName: string; item?: Item; gold: number }
  | { type: 'loot'; item?: Item; potion?: { potion: PotionId; tier: number }; soldFor?: number }
  | { type: 'bossHit'; damage: number; hp: number; maxHp: number; crit: boolean }
  | { type: 'bossDefeated'; name: string; index: number; gold: number; item?: Item }
  | { type: 'achievement'; name: string; tier: number }
  | { type: 'party'; text: string }
  | { type: 'toast'; text: string; small?: string; icon?: string };

type Handler = (e: FxEvent) => void;
const handlers = new Set<Handler>();

export const fx = {
  on(h: Handler): () => void {
    handlers.add(h);
    return () => {
      handlers.delete(h);
    };
  },
  emit(e: FxEvent) {
    handlers.forEach((h) => h(e));
  },
};
