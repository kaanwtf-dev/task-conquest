import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App';
import { useStore } from './state/store';
import { fx } from './state/fx';
import { setSfxVolume } from './audio/sfx';
import { initSync } from './state/sync';

const SpriteLab = lazy(() => import('./dev/SpriteLab'));

setSfxVolume(useStore.getState().settings.sfx);
initSync();

if (import.meta.env.DEV) Object.assign(window, { __ql: { store: useStore, fx } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash === '#lab' ? (
      <Suspense fallback={null}>
        <SpriteLab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
