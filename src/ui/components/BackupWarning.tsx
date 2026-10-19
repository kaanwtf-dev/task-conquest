// "Your save is only on this phone!": shown to players who aren't signed in, from the moment the hero exists.
// "Later" hides it for a few days; it keeps coming back until the save is backed up to the cloud.
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { t } from '../../i18n';

const NAG_AGAIN_MS = 3 * 86_400_000;

/** Signed in (account id), not (null), or no cloud on this site ('off'); undefined while loading. */
function useCloudAccount(): string | null | 'off' | undefined {
  const [v, setV] = useState<string | null | 'off' | undefined>(undefined);
  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    void import('../../state/sync').then(({ useSync }) => {
      if (!alive) return;
      const read = (s: { status: string; userId: string | null }) => setV(s.status === 'off' ? 'off' : s.userId);
      read(useSync.getState());
      off = useSync.subscribe(read);
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  return v;
}

/** Whether the "back up your save" card is showing now. */
export function useBackupDue(): boolean {
  const hasHero = useStore((s) => !!s.hero);
  const askedAt = useStore((s) => s.settings.backupAskedAt ?? 0);
  const account = useCloudAccount();
  return account === null && hasHero && Date.now() - askedAt >= NAG_AGAIN_MS;
}

export default function BackupWarning() {
  const update = useStore((s) => s.updateSettings);
  const setTab = useStore((s) => s.setTab);
  if (!useBackupDue()) return null;
  return (
    <div className="win backup-warn" role="alert">
      <div className="backup-warn-icon" aria-hidden>
        ⚠️
      </div>
      <div className="backup-warn-text">
        <b>{t('Your save is ONLY on this phone!!')}</b>
        <span>{t('Delete the app, clear your browser or lose your phone and your hero is gone forever. Back it up free, takes 30 seconds!')}</span>
      </div>
      <div className="backup-warn-actions">
        <button className="btn small" onClick={() => setTab('party')}>
          {t('Back up!')}
        </button>
        <button className="btn ghost small" onClick={() => update({ backupAskedAt: Date.now() })}>
          {t('Later')}
        </button>
      </div>
    </div>
  );
}
