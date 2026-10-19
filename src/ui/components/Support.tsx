// Tips and feedback: the "Support & feedback" box in Options, and a single, polite "enjoying it?" card on the
// quest screen for players who have been at it for a while.
import { useStore } from '../../state/store';
import { sum } from '../../game/progression';
import { FEEDBACK_URL, TIP_URL } from '../../links';
import { useBackupDue } from './BackupWarning';
import { rich } from './common';
import { t } from '../../i18n';

/** After this many finished quests, on at least this many days, the card asks once. */
const TIP_AFTER_QUESTS = 25;
const TIP_AFTER_DAYS = 3;
const ASK_AGAIN_MS = 30 * 86_400_000;

export const openLink = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

export function SupportBox() {
  const update = useStore((s) => s.updateSettings);
  if (!TIP_URL && !FEEDBACK_URL) return null;
  return (
    <>
      <div className="section-label">{t('Support & feedback')}</div>
      <div className="win support">
        <p>
          {rich(t('Task Conquest is made by one person and is {free}. Found a bug or got an idea? Tell me! Tips pay for the servers and keep new bosses, gear and features coming. ⚔️💛'), {
            free: <b>{t('free, with no ads and no subscriptions')}</b>,
          })}
        </p>
        <div className="support-actions">
          {TIP_URL && (
            <button
              className="btn"
              onClick={() => {
                update({ tipDone: true });
                openLink(TIP_URL);
              }}
            >
              <span className="btn-emoji">☕</span> {t('Tip the developer')}
            </button>
          )}
          {FEEDBACK_URL && (
            <button className="btn ghost" onClick={() => openLink(FEEDBACK_URL)}>
              <span className="btn-emoji">💬</span> {t('Send feedback')}
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
    <div className="win push-invite tip-nudge" role="region" aria-label={t('Support the developer')}>
      <div className="push-invite-icon" aria-hidden>
        ☕
      </div>
      <div className="push-invite-text">
        <b>{t('Enjoying Task Conquest?')}</b>
        <span>{t("{n} quests slain! It's free and ad-free, made by one dev. A small tip keeps it that way.", { n: done })}</span>
      </div>
      <div className="push-invite-actions">
        <button
          className="btn small"
          onClick={() => {
            update({ tipDone: true });
            openLink(TIP_URL);
          }}
        >
          {t('Tip')} <span className="btn-emoji">☕</span>
        </button>
        <button className="btn ghost small" onClick={() => update({ tipAskedAt: Date.now() })}>
          {t('Later')}
        </button>
        <button className="link-btn" style={{ fontSize: 13 }} onClick={() => update({ tipDone: true })}>
          {t('No thanks')}
        </button>
      </div>
    </div>
  );
}
