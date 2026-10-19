// Tips and feedback: the "Support Questlog" box in Options, and a single, polite "enjoying it?" card on the
// quest screen for players who have been at it for a while.
import { useStore } from '../../state/store';
import { sum } from '../../game/progression';
import { FEEDBACK_URL, TIP_URL } from '../../links';
import { useBackupDue } from './BackupWarning';

/** After this many finished quests, on at least this many days, the card asks once. */
const TIP_AFTER_QUESTS = 25;
const TIP_AFTER_DAYS = 3;
const ASK_AGAIN_MS = 30 * 86_400_000;

const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

export function SupportBox() {
  const update = useStore((s) => s.updateSettings);
  if (!TIP_URL && !FEEDBACK_URL) return null;
  return (
    <>
      <div className="section-label">Support Questlog</div>
      <div className="win support">
        <p>
          Questlog is made by one person and is <b>free, with no ads and no subscriptions</b>. Tips pay for the servers and keep new bosses,
          gear and features coming. ⚔️💛
        </p>
        <div className="support-actions">
          {TIP_URL && (
            <button
              className="btn"
              onClick={() => {
                update({ tipDone: true });
                open(TIP_URL);
              }}
            >
              <span className="btn-emoji">☕</span> Tip the developer
            </button>
          )}
          {FEEDBACK_URL && (
            <button className="btn ghost" onClick={() => open(FEEDBACK_URL)}>
              <span className="btn-emoji">💬</span> Send feedback
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** Asks once a player clearly enjoys the game; "Later" waits a month, a tip or "No thanks" ends it. */
export function TipNudge() {
  const done = useStore((s) => (s.hero ? sum(s.hero.tasksDone) : 0));
  const days = useStore((s) => s.hero?.activeDays.length ?? 0);
  const askedAt = useStore((s) => s.settings.tipAskedAt ?? 0);
  const finished = useStore((s) => !!s.settings.tipDone);
  const update = useStore((s) => s.updateSettings);
  const backupDue = useBackupDue();
  if (!TIP_URL || finished || backupDue || done < TIP_AFTER_QUESTS || days < TIP_AFTER_DAYS || Date.now() - askedAt < ASK_AGAIN_MS) return null;
  return (
    <div className="win push-invite tip-nudge" role="region" aria-label="Support the developer">
      <div className="push-invite-icon" aria-hidden>
        ☕
      </div>
      <div className="push-invite-text">
        <b>Enjoying Questlog?</b>
        <span>{done} quests slain! It's free and ad-free, made by one dev. A small tip keeps it that way.</span>
      </div>
      <div className="push-invite-actions">
        <button
          className="btn small"
          onClick={() => {
            update({ tipDone: true });
            open(TIP_URL);
          }}
        >
          Tip <span className="btn-emoji">☕</span>
        </button>
        <button className="btn ghost small" onClick={() => update({ tipAskedAt: Date.now() })}>
          Later
        </button>
        <button className="link-btn" style={{ fontSize: 13 }} onClick={() => update({ tipDone: true })}>
          No thanks
        </button>
      </div>
    </div>
  );
}
