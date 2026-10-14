// Who is in each party list, shared by the Party tab and the heroes strip on a list's screen.
// Kept free of the sync code so the app shell can read it without loading that bundle.
import type { PartyMember } from '../sync/party';

/** A roster older than this is fetched again when the app comes back to the foreground. */
export const ROSTER_FRESH_MS = 60_000;

const entries = new Map<string, { at: number; members: PartyMember[] }>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export const partyRoster = {
  get: (listId: string) => entries.get(listId)?.members ?? null,
  isFresh: (listId: string) => {
    const e = entries.get(listId);
    return !!e && Date.now() - e.at < ROSTER_FRESH_MS;
  },
  set(listId: string, members: PartyMember[]) {
    entries.set(listId, { at: Date.now(), members });
    changed();
  },
  /** Forget one list's roster (left it), or every roster (signed out). */
  drop(listId?: string) {
    if (listId) entries.delete(listId);
    else entries.clear();
    changed();
  },
  subscribe(f: () => void) {
    listeners.add(f);
    return () => void listeners.delete(f);
  },
};
