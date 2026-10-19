// The party leaderboard: everyone sharing a list with you, ranked by points over the last 7 days.
import { useEffect, useState } from 'react';
import { useSync } from '../../state/sync';
import { BOARD_DAYS, BOARD_POINTS, DAY_CAP, rankBoard } from '../../game/leaderboard';
import type { BoardMember } from '../../sync/party';
import { memberSprite } from './PartyStrip';
import { PxImg } from './common';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const me = useSync((s) => s.userId);
  const [rows, setRows] = useState<BoardMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [rules, setRules] = useState(false);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    const load = () =>
      document.visibilityState === 'visible' &&
      import('../../sync/party')
        .then(({ partyBoard }) => partyBoard())
        .then(
          (r) => alive && (setRows(r), setFailed(false)),
          () => alive && setFailed(true),
        );
    load();
    const t = window.setInterval(load, 60_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', load);
    };
  }, [me]);

  if (!me) return null;
  const ranked = rows ? rankBoard(rows) : [];
  const alone = rows !== null && rows.length < 2;
  return (
    <>
      <div className="section-label">Leaderboard · last {BOARD_DAYS} days</div>
      <div className="win board">
        {rows === null ? (
          <div className="board-note">{failed ? 'The leaderboard needs the latest cloud setup (re-run supabase/schema.sql).' : 'Loading…'}</div>
        ) : (
          ranked.map((r) => {
            const sprite = memberSprite(r);
            return (
              <div key={r.userId} className={`board-row ${r.userId === me ? 'me' : ''}`}>
                <span className="board-rank">{MEDALS[r.rank - 1] ?? `#${r.rank}`}</span>
                {sprite ? <PxImg src={sprite} size={36} /> : <span className="board-nosprite" />}
                <div className="board-who">
                  <b>
                    {r.name}
                    {r.userId === me ? ' (you)' : ''}
                  </b>
                  <span className="board-days" aria-label={`${r.days} of ${BOARD_DAYS} days`}>
                    {Array.from({ length: BOARD_DAYS }, (_, i) => (i < r.days ? '■' : '□')).join('')} Lv {r.level}
                  </span>
                </div>
                <span className="board-pts">{r.points}</span>
              </div>
            );
          })
        )}
        {alone && <div className="board-note">Share a list with friends (Lists → Invite) and they show up here.</div>}
        <button className="board-how" onClick={() => setRules((v) => !v)} aria-expanded={rules}>
          {rules ? 'Hide the rules' : 'How points work'}
        </button>
        {rules && (
          <div className="board-note">
            Every quest you finish scores by difficulty: Trivial {BOARD_POINTS[0]}, Easy {BOARD_POINTS[1]}, Normal {BOARD_POINTS[2]}, Hard{' '}
            {BOARD_POINTS[3]}, Epic {BOARD_POINTS[4]}, at most {DAY_CAP} a day. Only the last {BOARD_DAYS} days count, and a day can only be
            scored on the day itself (or the morning after), so it's about showing up daily, not one giant grind. Groceries don't count, and
            on shared lists you score only what you did.
          </div>
        )}
      </div>
    </>
  );
}
