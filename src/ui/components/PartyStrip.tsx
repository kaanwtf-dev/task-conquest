// The heroes of a party list, side by side under its banner.
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { heroLevel } from '../../game/progression';
import { CLASS_BY_ID } from '../../game/catalog';
import { heroPix } from '../../pixel/sprites/hero';
import { spriteUrl } from '../../pixel/pix';
import type { TaskList } from '../../core/types';
import type { PartyMember } from '../../sync/party';
import { partyRoster } from '../partyRoster';
import { PxImg } from './common';

/** A member's hero sprite, or null when their published look can't be drawn (it never takes the screen down). */
export function memberSprite(m: Pick<PartyMember, 'userId' | 'appearance' | 'classId'>): string | null {
  if (!m.appearance) return null;
  try {
    return spriteUrl(`member:${m.userId}:${JSON.stringify(m.appearance)}:${m.classId}`, () =>
      heroPix(m.appearance!, CLASS_BY_ID[m.classId ?? 'knight']?.look ?? {}),
    );
  } catch {
    return null;
  }
}

/** The party of a shared list once this device is signed in; null while unknown, offline or signed out. */
function useParty(list: TaskList): { members: PartyMember[] | null; me: string | null } {
  const [members, setMembers] = useState<PartyMember[] | null>(() => partyRoster.get(list.id));
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    if (!list.shared) return;
    let alive = true;
    let userId: string | null = null;
    let loading = false;
    let fetchRoster: ((listId: string) => Promise<PartyMember[]>) | null = null;
    const show = () => alive && setMembers(userId ? partyRoster.get(list.id) : null);
    const load = () => {
      if (!alive || !userId || !fetchRoster || loading || partyRoster.isFresh(list.id)) return;
      loading = true;
      fetchRoster(list.id)
        .then((m) => partyRoster.set(list.id, m), () => undefined) // offline: keep what we had, retry on wake
        .finally(() => (loading = false));
    };
    // back from the background, refocused or back online: a partner may have joined, or the first try failed
    const wake = () => document.visibilityState === 'visible' && load();
    const unsubRoster = partyRoster.subscribe(show);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    let unsubSync: (() => void) | undefined;
    // sync code loads separately from the app shell; the roster needs a signed-in account
    void Promise.all([import('../../state/sync'), import('../../sync/party')]).then(([{ useSync }, { listParty }]) => {
      if (!alive) return;
      fetchRoster = listParty;
      const signedIn = (id: string | null) => {
        userId = id;
        setMe(id);
        show();
        load();
      };
      signedIn(useSync.getState().userId);
      unsubSync = useSync.subscribe((s, prev) => {
        if (s.userId === prev.userId) return;
        if (!s.userId) partyRoster.drop(); // signed out: nobody's party shows any more
        signedIn(s.userId);
      });
    });
    return () => {
      alive = false;
      unsubRoster();
      unsubSync?.();
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
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
      {shown.map((m, i) => {
        const sprite = memberSprite(m);
        return (
          <div key={m.userId} className="pmember" title={`${m.name} · Lv${m.level}${m.role === 'owner' ? ' · leader' : ''}`}>
            <div className="pmember-sprite" style={{ animationDelay: `${(i % 4) * -0.35}s` }}>
              {sprite ? <PxImg src={sprite} size={48} /> : <div style={{ width: 48, height: 48 }} />}
            </div>
            <div className="pmember-name">
              {m.role === 'owner' && <span aria-hidden>♛ </span>}
              {m.name}
            </div>
            <div className="pmember-lv">Lv{m.level}</div>
          </div>
        );
      })}
      {shown.length < 2 && (
        <button className="pmember pmember-invite" onClick={() => setTab('party')} aria-label="Invite someone to this list">
          <div className="pmember-sprite">+</div>
          <div className="pmember-name">Invite</div>
        </button>
      )}
    </div>
  );
}
