import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App';
import { useStore } from './state/store';
import { fx } from './state/fx';
import { setSfxVolume } from './audio/sfx';
import { registerPWA, requestPersistentStorage } from './pwa';
import { watchInstall } from './install';
import { useAppUpdate } from './ui/components/UpdateBanner';
import { trackKeyboard } from './ui/keyboard';
import { resolveLang, setLang, t } from './i18n';
import { readRecoveryLink } from './sync/recovery';
import PasswordReset from './ui/screens/PasswordReset';

setLang(resolveLang(useStore.getState().settings.lang));

// a password-reset email's link (read before the Supabase client consumes the address)
const recovery = readRecoveryLink(location.hash);

const SpriteLab = lazy(() => import('./dev/SpriteLab'));

watchInstall();
setSfxVolume(useStore.getState().settings.sfx);
trackKeyboard();
// the sync stack (Supabase client) loads in its own chunk so first paint stays light
// (not on the reset page: the link's session is only there to change the password)
if (!recovery) void import('./state/sync').then((m) => m.initSync());
registerPWA(
  (update) => useAppUpdate.setState({ update }),
  () => fx.emit({ type: 'toast', text: t('READY OFFLINE'), small: t('Task Conquest now works without internet.') }),
);
if (useStore.getState().hero) void requestPersistentStorage();
else {
  const off = useStore.subscribe((s) => {
    if (s.hero) {
      off();
      void requestPersistentStorage();
    }
  });
}

if (import.meta.env.DEV) Object.assign(window, { __ql: { store: useStore, fx } });

/** The app in the chosen language; changing the language redraws everything. */
function Root() {
  const pref = useStore((s) => s.settings.lang);
  const lang = resolveLang(pref);
  setLang(lang);
  return <App key={lang} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {recovery ? (
      <PasswordReset link={recovery} />
    ) : location.hash === '#lab' ? (
      <Suspense fallback={null}>
        <SpriteLab />
      </Suspense>
    ) : (
      <Root />
    )}
  </StrictMode>,
);
