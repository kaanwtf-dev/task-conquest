// "Put it on your Home Screen": Chrome, Edge and Samsung Internet (Android and computers) let the page show
// their own install prompt (beforeinstallprompt); Safari doesn't, so iPhone players get illustrated steps.
import { create } from 'zustand';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Where the game is running, for which install steps to show. */
export type InstallPlatform =
  | 'ios-safari' // Share › Add to Home Screen
  | 'ios-other' // Chrome/Firefox/Edge on iPhone: Share in the address bar, else Safari
  | 'ios-inapp' // inside Instagram, TikTok, Facebook…: open it in Safari first
  | 'android' // browser menu › Add to Home screen / Install app
  | 'mac-safari' // File › Add to Dock
  | 'desktop' // the install icon in the address bar, or the browser menu
  | 'other';

/** Running as the installed app (Home Screen / Dock), not in a browser tab? */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return true;
  return (
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function installPlatform(ua = navigator.userAgent, touch = navigator.maxTouchPoints ?? 0): InstallPlatform {
  // iPadOS reports a Mac user agent; a touch screen gives it away
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
  if (ios) {
    if (/FBAN|FBAV|Instagram|musical_ly|Bytedance|TikTok|Snapchat|LinkedInApp|Twitter|Line\/|GSA\//.test(ua)) return 'ios-inapp';
    if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'mac-safari';
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop';
  return 'other';
}

interface InstallState {
  /** the browser's own install prompt, when it offered one */
  prompt: InstallPromptEvent | null;
  installed: boolean;
}

export const useInstall = create<InstallState>(() => ({ prompt: null, installed: isInstalled() }));

/** Catch the browser's install offer (it fires once, early: call this before the app renders). */
export function watchInstall() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // shown from our own button instead of the browser's mini-bar
    useInstall.setState({ prompt: e as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => useInstall.setState({ installed: true, prompt: null }));
  matchMedia('(display-mode: standalone)').addEventListener?.('change', () => useInstall.setState({ installed: isInstalled() }));
}

/** Shows the browser's install prompt. True when installed, false when declined, null when there is none. */
export async function promptInstall(): Promise<boolean | null> {
  const p = useInstall.getState().prompt;
  if (!p) return null;
  useInstall.setState({ prompt: null }); // a prompt can only be shown once
  await p.prompt();
  const { outcome } = await p.userChoice;
  if (outcome === 'accepted') useInstall.setState({ installed: true });
  return outcome === 'accepted';
}
