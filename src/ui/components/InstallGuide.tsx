// "Install the app": one tap where the browser allows it (Chrome, Edge, Samsung Internet), and an
// illustrated walkthrough everywhere else (Safari on iPhone can only be added through its Share menu).
import { useState } from 'react';
import { useStore } from '../../state/store';
import { installPlatform, promptInstall, useInstall, type InstallPlatform } from '../../install';
import { Sheet } from './common';
import { sfx } from '../../audio/sfx';
import { t } from '../../i18n';

/** The install card on the quest list comes back this long after "Not now". */
const ASK_AGAIN_MS = 7 * 86_400_000;

const asset = (path: string) => {
  const env = import.meta.env as Record<string, unknown>;
  return `${typeof env.BASE_URL === 'string' ? env.BASE_URL : '/'}${path}`;
};
const SITE = typeof location !== 'undefined' ? location.host : 'kaanwtf-dev.github.io/task-conquest';

/** Whether there is anything to install from here (not already the installed app). */
export function useCanInstall(): boolean {
  return !useInstall((s) => s.installed);
}

/** Opens the browser's install prompt, or the walkthrough when there is none. */
export function useStartInstall(): [() => void, React.ReactNode] {
  const [guide, setGuide] = useState(false);
  const start = () => {
    sfx.tick();
    void promptInstall().then((r) => {
      if (r === null) setGuide(true);
    });
  };
  return [start, guide ? <InstallSheet onClose={() => setGuide(false)} /> : null];
}

export function InstallButton({ className = 'btn small' }: { className?: string }) {
  const can = useCanInstall();
  const [start, sheet] = useStartInstall();
  if (!can) return null;
  return (
    <>
      <button className={className} onClick={start}>
        📲 {t('Install the app')}
      </button>
      {sheet}
    </>
  );
}

/** A small card on the quest list for players still in a browser tab; "Not now" hides it for a week. */
export function InstallCard() {
  const can = useCanInstall();
  const askedAt = useStore((s) => s.settings.installAskedAt ?? 0);
  const update = useStore((s) => s.updateSettings);
  const [start, sheet] = useStartInstall();
  if (!can || Date.now() - askedAt < ASK_AGAIN_MS) return null;
  return (
    <div className="win install-card">
      <img src={asset('icon-192.png')} alt="" className="install-card-icon" />
      <div className="install-card-text">
        <b>{t('Put Task Conquest on your Home Screen')}</b>
        <span>{t('Opens full screen like a real app, works offline and can send reminders.')}</span>
      </div>
      <div className="install-card-actions">
        <button className="btn small" onClick={start}>
          {t('Install')}
        </button>
        <button className="btn ghost small" onClick={() => update({ installAskedAt: Date.now() })}>
          {t('Not now')}
        </button>
      </div>
      {sheet}
    </div>
  );
}

interface Step {
  text: React.ReactNode;
  art: React.ReactNode;
}

/** Bold the on-screen button name inside a translated sentence ("Tap {key}"). */
function keyed(text: string, key: string) {
  const [a, b] = text.split('{key}');
  return (
    <>
      {a}
      <b className="ig-key">{key}</b>
      {b}
    </>
  );
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
    <path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const AddIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
    <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** A tiny phone screen: the browser chrome or sheet the player is looking for, with the target lit up. */
function Phone({ children, top }: { children: React.ReactNode; top?: boolean }) {
  return (
    <div className={`ig-phone ${top ? 'top' : ''}`} aria-hidden>
      {children}
    </div>
  );
}

function SafariBar() {
  return (
    <Phone>
      <div className="ig-page">{'Task Conquest'}</div>
      <div className="ig-bar">
        <span className="ig-dim">‹</span>
        <span className="ig-url">{SITE}</span>
        <span className="ig-hit ig-round">
          <ShareIcon />
        </span>
        <span className="ig-dim">⋯</span>
      </div>
    </Phone>
  );
}

function ShareSheet() {
  return (
    <Phone>
      <div className="ig-sheet">
        <div className="ig-row ig-dim">{t('Copy')}</div>
        <div className="ig-row ig-dim">{t('Add to Reading List')}</div>
        <div className="ig-row ig-hit">
          {t('Add to Home Screen')} <AddIcon />
        </div>
        <div className="ig-row ig-dim">{t('Find on Page')}</div>
      </div>
    </Phone>
  );
}

function AddDialog({ button }: { button: string }) {
  return (
    <Phone>
      <div className="ig-sheet">
        <div className="ig-head">
          <span className="ig-dim">{t('Cancel')}</span>
          <span className="ig-hit ig-pill">{button}</span>
        </div>
        <div className="ig-app">
          <img src={asset('icon-192.png')} alt="" />
          <span>{'Task Conquest'}</span>
        </div>
      </div>
    </Phone>
  );
}

function HomeScreen() {
  return (
    <Phone>
      <div className="ig-home">
        {['#5b6ee1', '#6abe30', '#d95763', '#df7126', '#639bff', '#8f563b', '#76428a'].map((c) => (
          <span key={c} className="ig-icon" style={{ background: c }} />
        ))}
        <img className="ig-icon ig-hit-glow" src={asset('icon-192.png')} alt="" />
      </div>
    </Phone>
  );
}

function ChromeBar({ dots = true }: { dots?: boolean }) {
  return (
    <Phone top>
      <div className="ig-bar">
        <span className="ig-url">{SITE}</span>
        {dots ? <span className="ig-hit ig-round">⋮</span> : <span className="ig-hit ig-round"><ShareIcon /></span>}
      </div>
      <div className="ig-page">{'Task Conquest'}</div>
    </Phone>
  );
}

function ChromeMenu() {
  return (
    <Phone top>
      <div className="ig-menu">
        <div className="ig-row ig-dim">{t('New tab')}</div>
        <div className="ig-row ig-dim">{t('History')}</div>
        <div className="ig-row ig-hit">{t('Install app')} / {t('Add to Home screen')}</div>
        <div className="ig-row ig-dim">{t('Settings')}</div>
      </div>
    </Phone>
  );
}

function DesktopBar() {
  return (
    <Phone top>
      <div className="ig-bar">
        <span className="ig-url">{SITE}</span>
        <span className="ig-hit ig-round">⊕</span>
        <span className="ig-dim">⋮</span>
      </div>
      <div className="ig-page">{'Task Conquest'}</div>
    </Phone>
  );
}

function MacMenu() {
  return (
    <Phone top>
      <div className="ig-macbar">
        <span>{'Safari'}</span>
        <span className="ig-hit">{t('File')}</span>
        <span className="ig-dim">{t('Edit')}</span>
        <span className="ig-dim">{t('View')}</span>
      </div>
      <div className="ig-menu">
        <div className="ig-row ig-dim">{t('New Window')}</div>
        <div className="ig-row ig-hit">{t('Add to Dock…')}</div>
        <div className="ig-row ig-dim">{t('Share')}</div>
      </div>
    </Phone>
  );
}

function stepsFor(p: InstallPlatform): Step[] {
  const safari: Step[] = [
    { text: <>{keyed(t('Tap {key} at the bottom of Safari.'), t('Share'))} <small>{t("Don't see it? Tap ⋯ first, then Share.")}</small></>, art: <SafariBar /> },
    { text: keyed(t('Scroll down and tap {key}.'), t('Add to Home Screen')), art: <ShareSheet /> },
    { text: keyed(t('Tap {key} in the top corner.'), t('Add')), art: <AddDialog button={t('Add')} /> },
    { text: t('Done! Open Task Conquest from your Home Screen.'), art: <HomeScreen /> },
  ];
  switch (p) {
    case 'ios-safari':
      return safari;
    case 'ios-other':
      return [
        { text: <>{keyed(t('Tap {key} in the address bar.'), t('Share'))} <small>{t("Don't see Add to Home Screen? Open this page in Safari instead.")}</small></>, art: <ChromeBar dots={false} /> },
        ...safari.slice(1),
      ];
    case 'ios-inapp':
      return [
        { text: <>{keyed(t('This app can’t add it. Tap {key} and choose Open in Safari (or Open in browser).'), '⋯')}</>, art: <ChromeBar /> },
        ...safari,
      ];
    case 'android':
      return [
        { text: keyed(t('Tap the {key} menu at the top of Chrome.'), '⋮'), art: <ChromeBar /> },
        { text: keyed(t('Tap {key}.'), `${t('Install app')} / ${t('Add to Home screen')}`), art: <ChromeMenu /> },
        { text: keyed(t('Tap {key}.'), t('Install')), art: <AddDialog button={t('Install')} /> },
        { text: t('Done! Open Task Conquest from your Home Screen.'), art: <HomeScreen /> },
      ];
    case 'mac-safari':
      return [{ text: keyed(t('In the menu bar, choose {key}.'), `${t('File')} › ${t('Add to Dock…')}`), art: <MacMenu /> }, { text: keyed(t('Tap {key}.'), t('Add')), art: <AddDialog button={t('Add')} /> }];
    default:
      return [
        { text: keyed(t('Click the install icon {key} at the right end of the address bar (or find Install in the browser menu).'), '⊕'), art: <DesktopBar /> },
        { text: keyed(t('Tap {key}.'), t('Install')), art: <AddDialog button={t('Install')} /> },
      ];
  }
}

export function InstallSheet({ onClose }: { onClose: () => void }) {
  const [platform] = useState(() => installPlatform());
  const steps = stepsFor(platform);
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard?.writeText(location.href).then(
      () => setCopied(true),
      () => undefined,
    );
  return (
    <Sheet onClose={onClose} className="install-guide">
      <div className="win-title">{t('📲 Put it on your Home Screen')}</div>
      <p className="ig-intro">{t('Then it opens full screen like a real app, works offline, and can send you reminders.')}</p>
      <ol className="ig-steps">
        {steps.map((s, i) => (
          <li key={i} className="ig-step">
            <span className="ig-num">{i + 1}</span>
            <div className="ig-text">{s.text}</div>
            {s.art}
          </li>
        ))}
      </ol>
      {platform === 'ios-inapp' && (
        <button className="btn ghost small" onClick={copy}>
          {copied ? t('Link copied! Paste it in Safari.') : t('Copy link')}
        </button>
      )}
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>
          {t('Got it')}
        </button>
      </div>
    </Sheet>
  );
}
