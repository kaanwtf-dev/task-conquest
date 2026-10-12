import { useMemo } from 'react';
import type { Hero, Item } from '../core/types';
import type { GearLook } from '../pixel/sprites/hero';
import { gearLook } from './loot';
import { CLASS_BY_ID } from './catalog';
import { equippedItems, useStore } from '../state/store';

/** Visual gear for the hero sprite: equipped items (plus cape dye), class kit as a last resort. */
export function heroLook(hero: Hero | null | undefined, items: Record<string, Item>): GearLook {
  if (!hero) return {};
  const eq = equippedItems({ hero, items });
  const look = Object.keys(eq).length ? gearLook(eq) : { ...(CLASS_BY_ID[hero.classId]?.look ?? {}) };
  if (hero.capeDye && look.cape) look.cape = hero.capeDye;
  return look;
}

export function useHeroLook(): GearLook {
  const hero = useStore((s) => s.hero);
  const items = useStore((s) => s.items);
  return useMemo(() => heroLook(hero, items), [hero?.equipped, hero?.capeDye, hero?.classId, items]);
}
