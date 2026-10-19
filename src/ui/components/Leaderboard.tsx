// The party leaderboard: everyone sharing a list with you, ranked by points over the last 7 days.
import { useEffect, useState } from 'react';
import { useSync } from '../../state/sync';
import { BOARD_DAYS, BOARD_POINTS, DAY_CAP, rankBoard } from '../../game/leaderboard';
import type { BoardMember } from '../../sync/party';
import { memberSprite } from './PartyStrip';
import { PxImg } from './common';
import { t } from '../../i18n';

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
    const timer = window.setInterval(load, 60_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [me]);

  if (!me) return null;
  const ranked = rows ? rankBoard(rows) : [];
  const alone = rows !== null && rows.length < 2;
  return (
    <>
      <div className="section-label">{t('Leaderboard · last {days} days', { days: BOARD_DAYS })}</div>
      <div className="win board">
        {rows === null ? (
          <div className="board-note">{failed ? t('The leaderboard needs the latest cloud setup (re-run supabase/schema.sql).') : t('Loading…')}</div>
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
                    {r.userId === me ? t(' (you)') : ''}
                  </b>
                  <span className="board-days" aria-label={t('{n} of {days} days', { n: r.days, days: BOARD_DAYS })}>
                    {Array.from({ length: BOARD_DAYS }, (_, i) => (i < r.days ? '■' : '□')).join('')} {t('Lv {level}', { level: r.level })}
                  </span>
                </div>
                <span className="board-pts">{r.points}</span>
              </div>
            );
          })
        )}
        {alone && <div className="board-note">{t('Share a list with friends (Lists → Invite) and they show up here.')}</div>}
        <button className="board-how" onClick={() => setRules((v) => !v)} aria-expanded={rules}>
          {rules ? t('Hide the rules') : t('How points work')}
        </button>
        {rules && (
          <div className="board-note">
            {t(
              "Every quest you finish scores by difficulty: Trivial {trivial}, Easy {easy}, Normal {normal}, Hard {hard}, Epic {epic}, at most {cap} a day. Only the last {days} days count, and a day can only be scored on the day itself (or the morning after), so it's about showing up daily, not one giant grind. Groceries don't count, and on shared lists you score only what you did.",
              { trivial: BOARD_POINTS[0], easy: BOARD_POINTS[1], normal: BOARD_POINTS[2], hard: BOARD_POINTS[3], epic: BOARD_POINTS[4], cap: DAY_CAP, days: BOARD_DAYS },
            )}
          </div>
        )}
      </div>
    </>
  );
}
