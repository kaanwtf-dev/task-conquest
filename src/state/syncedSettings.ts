// Settings that follow the player's account: they ride along in the synced hero (hero.prefs), newest change
// wins. The rest stay on the device on purpose: where the hero window was dragged, cards put off here, this
// device's notification subscription, which "what's new" this device has shown.
import type { Settings } from '../core/types';

export const SYNCED_SETTINGS = [
  'lang',
  'anim',
  'sfx',
  'music',
  'haptics',
  'dayStartHour',
  'weekStart',
  'taskFont',
  'cornerHero',
  'popups',
  'push',
  'aisleMemory',
  'difficultyMemory',
  'introSeen',
  'tipDone',
] as const satisfies readonly (keyof Settings)[];

export type SyncedSettings = Pick<Settings, (typeof SYNCED_SETTINGS)[number]>;

/** Does this change touch a setting that follows the account? */
export function touchesSynced(patch: Partial<Settings>): boolean {
  return SYNCED_SETTINGS.some((k) => k in patch);
}

/** The account-wide settings, to keep in the hero. */
export function pickSynced(s: Settings): Partial<SyncedSettings> {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_SETTINGS) if (s[k] !== undefined) out[k] = s[k];
  return out as Partial<SyncedSettings>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const vol = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;
const strMap = (v: unknown, ok: (x: unknown) => boolean) =>
  isObj(v) && Object.keys(v).length <= 2000 && Object.entries(v).every(([k, x]) => k.length <= 120 && ok(x));

/**
 * Settings from the cloud, keeping only known keys with sane values: they come from another device's save,
 * so anything malformed is dropped rather than trusted.
 */
export function sanitizeSynced(v: unknown): Partial<SyncedSettings> {
  if (!isObj(v)) return {};
  const ok: Record<(typeof SYNCED_SETTINGS)[number], (x: unknown) => boolean> = {
    lang: (x) => x === 'auto' || x === 'en' || x === 'tr',
    anim: (x) => x === 'full' || x === 'quick' || x === 'off',
    sfx: vol,
    music: vol,
    haptics: (x) => typeof x === 'boolean',
    dayStartHour: (x) => int(x, 0, 23),
    weekStart: (x) => int(x, 0, 6),
    taskFont: (x) => x === 'pixel' || x === 'clean',
    cornerHero: (x) => x === 'big' || x === 'small' || x === 'bar' || x === 'hidden',
    popups: (x) => x === 'stay' || x === 'auto',
    push: (x) => isObj(x) && int(x.morningHour, 0, 23) && int(x.eveningHour, 0, 23) && Array.isArray(x.off) && x.off.every((k) => typeof k === 'string'),
    aisleMemory: (x) => strMap(x, (y) => typeof y === 'string' && y.length <= 40),
    difficultyMemory: (x) => strMap(x, (y) => int(y, 0, 4)),
    introSeen: (x) => typeof x === 'boolean',
    tipDone: (x) => typeof x === 'boolean',
  };
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_SETTINGS) if (k in v && ok[k](v[k])) out[k] = v[k];
  return out as Partial<SyncedSettings>;
}
