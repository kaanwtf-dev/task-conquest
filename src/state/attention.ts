// Tiny cross-module flags for tab badges (kept apart from sync.ts so the main bundle doesn't pull in Supabase).
import { create } from 'zustand';

/** Tabs waiting on the player, e.g. a sync choice that blocks syncing until it is made. */
export const useAttention = create<{ party: boolean }>(() => ({ party: false }));
