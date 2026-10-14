// Where the phone's floating hero window rests after a drag. Pure, so it can be tested without a DOM.
import type { HeroDock } from '../core/types';

/** Pushed this far (fraction of its width) past an edge, the window tucks away. */
export const TUCK_AT = 0.4;
export const HOME_DOCK: HeroDock = { side: 'right', lift: 0, tucked: false };

/** Where a dropped window settles: tucked past an edge, or snapped to the nearer side. */
export function settle(left: number, width: number, viewport: number, lift: number, maxLift: number): HeroDock {
  const over = Math.max(-left, left + width - viewport);
  const side: HeroDock['side'] = left + width / 2 < viewport / 2 ? 'left' : 'right';
  return { side, lift: Math.max(0, Math.min(maxLift, Math.round(lift))), tucked: over > width * TUCK_AT };
}
