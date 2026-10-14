// The heroes of a party list, side by side under its banner.
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { heroLevel } from '../../game/progression';
import { CLASS_BY_ID } from '../../game/catalog';
import { heroPix } from '../../pixel/sprites/hero';
import { spriteUrl } from '../../pixel/pix';
import type { TaskList } from '../../core/types';
import type { PartyMember } from '../../sync/party';
import { PxImg } from './common';

/** Rosters change rarely: reuse one for a minute so flipping between lists doesn't refetch or flicker. */
const FRESH_MS = 60_000;
const cache = new Map<string, { at: number; members: PartyMember[] }>();

/** The party of a shared list, once this device is signed in; null while unknown (or offline). */
function useParty(list: TaskList): { members: PartyMember[] | null; me: string | null } {
  const [members, setMembers] = useState<PartyMember[] | null>(() => cache.get(list.id)?.members ?? null);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    if (!list.shared) return;
    let alive = true;
    let unsub: (() => void) | undefined;
    setMembers(cache.get(list.id)?.members ?? null);
    // sync code loads separately from the app shell; the roster needs a signed-in account
    void Promise.all([import('../../state/sync'), import('../../sync/party')]).then(([{ useSync }, { listParty }]) => {
      if (!alive) return;
      const load = (userId: string | null) => {
        if (!alive || !userId) return;
        setMe(userId);
        const hit = cache.get(list.id);
        if (hit && Date.now() - hit.at < FRESH_MS) return setMembers(hit.members);
        listParty(list.id).then(
          (m) => {
            cache.set(list.id, { at: Date.now(), members: m });
            if (alive) setMembers(m);
          },
          () => undefined, // offline or signed out: keep what we had
        );
      };
      load(useSync.getState().userId);
      // signing in finishes after the first screen draws
      unsub = useSync.subscribe((s, prev) => s.userId !== prev.userId && load(s.userId));
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, [list.id, list.shared]);

  return { members: list.shared ? members : null, me };
}

export default function PartyStrip({ list }: { list: TaskList }) {
  const { members, me } = useParty(list);
  const hero = useStore((s) => s.hero);
  const setTab = useStore((s) => s.setTab);
  if (!members?.length) return null;
  // this device's own hero is drawn from the live save, not the last published card
  const shown = members.map((m) =>
    m.userId === me && hero
      ? { ...m, name: hero.name, level: heroLevel(hero).level, appearance: hero.appearance, classId: hero.classId }
      : m,
  );
  return (
    <div className="win party-strip" role="group" aria-label={`Party: ${shown.map((m) => m.name).join(', ')}`}>
      {shown.map((m, i) => (
        <div key={m.userId} className="pmember" title={`${m.name} · Lv${m.level}${m.role === 'owner' ? ' · leader' : ''}`}>
          <div className="pmember-sprite" style={{ animationDelay: `${(i % 4) * -0.35}s` }}>
            {m.appearance ? (
              <PxImg
                src={spriteUrl(`member:${m.userId}:${JSON.stringify(m.appearance)}:${m.classId}`, () =>
                  heroPix(m.appearance!, CLASS_BY_ID[m.classId ?? 'knight']?.look ?? {}),
                )}
                size={48}
              />
            ) : (
              <div style={{ width: 48, height: 48 }} />
            )}
          </div>
          <div className="pmember-name">
            {m.role === 'owner' && <span aria-hidden>♛ </span>}
            {m.name}
          </div>
          <div className="pmember-lv">Lv{m.level}</div>
        </div>
      ))}
      {shown.length < 2 && (
        <button className="pmember pmember-invite" onClick={() => setTab('party')} aria-label="Invite someone to this list">
          <div className="pmember-sprite">+</div>
          <div className="pmember-name">Invite</div>
        </button>
      )}
    </div>
  );
}
