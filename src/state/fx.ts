// Fire-and-forget event bus for visual effects (battles, level ups, loot toasts).
import type { MonsterSpawn } from '../game/catalog';

export type FxEvent =
  | { type: 'kill'; monster: MonsterSpawn; xp: number; gold: number; crit: boolean; theme: string; listId: string }
  | { type: 'levelUp'; level: number }
  | { type: 'skillUp'; skill: string; level: number }
  | { type: 'questComplete'; listName: string }
  | { type: 'toast'; text: string; icon?: string };

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
