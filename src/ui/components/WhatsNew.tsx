// The "what's new" window: shown once after an update (src/whatsNew.ts), and again from Options.
import { useStore } from '../../state/store';
import { LATEST_VERSION, RELEASES, type Release } from '../../whatsNew';
import { FEEDBACK_URL } from '../../links';
import { openLink } from './Support';
import { Sheet } from './common';
import { t } from '../../i18n';

const asset = (path: string) => {
  const env = import.meta.env as Record<string, unknown>;
  return `${typeof env.BASE_URL === 'string' ? env.BASE_URL : '/'}${path}`;
};

export function WhatsNewSheet({ release = RELEASES[0], onClose }: { release?: Release; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} className="whats-new">
      <div className="pixel whats-new-tag">{t("What's new · v{version}", { version: release.version })}</div>
      <div className="win-title">{t(release.title)}</div>
      {release.image && <img className="whats-new-shot" src={asset(release.image)} alt="" loading="lazy" />}
      <ul>
        {release.items.map((item) => (
          <li key={item}>{t(item)}</li>
        ))}
      </ul>
      <div className="sheet-actions">
        {FEEDBACK_URL ? (
          <button className="btn ghost" onClick={() => openLink(FEEDBACK_URL)}>
            <span className="btn-emoji">💬</span> {t('Feedback')}
          </button>
        ) : (
          <span />
        )}
        <button className="btn" onClick={onClose}>
          {t('Nice!')}
        </button>
      </div>
    </Sheet>
  );
}

/** After an update: the newest notes, once (players who have never seen notes before get the newest too). */
export default function WhatsNew() {
  const due = useStore((s) => !!s.hero && !!s.settings.introSeen && s.settings.seenVersion !== LATEST_VERSION);
  const update = useStore((s) => s.updateSettings);
  if (!due) return null;
  return <WhatsNewSheet onClose={() => update({ seenVersion: LATEST_VERSION })} />;
}
