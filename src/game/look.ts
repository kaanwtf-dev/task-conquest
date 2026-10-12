import type { Hero } from '../core/types';
import type { GearLook } from '../pixel/sprites/hero';
import { CLASS_BY_ID } from './catalog';

/** Visual gear for the hero sprite (class starter kit; equipped loot will layer on top). */
export function heroLook(hero: Pick<Hero, 'classId'>): GearLook {
  return CLASS_BY_ID[hero.classId]?.look ?? {};
}
