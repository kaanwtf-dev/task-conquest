// Reminder notifications on this device: support, permission, the push subscription, and the copy of the
// reminder settings the scheduled sender (scripts/push) reads from the cloud. The app icon badge too.
import type { Settings } from '../core/types';
import { DEFAULT_PUSH_PREFS, type PushPrefs } from './nudges';

const VAPID = String((import.meta.env as Record<string, unknown>).VITE_VAPID_PUBLIC_KEY ?? '').trim();

/** 'install': an iPhone/iPad Safari tab; reminders work once Questlog is added to the Home Screen. */
export type PushSupport = 'ok' | 'install' | 'unsupported';

const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !VAPID) return 'unsupported';
  if (isIOS() && !standalone()) return 'install';
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'ok' : 'unsupported';
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** What the sender needs to know: the reminder times and kinds, plus the day boundaries of this save. */
export function pushPrefs(settings: Settings): PushPrefs {
  return {
    ...DEFAULT_PUSH_PREFS,
    ...settings.push,
    off: settings.push?.off ?? [],
    dayStartHour: settings.dayStartHour,
    weekStart: settings.weekStart,
  };
}

function timeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(what)), ms))]);
}

const keyBytes = (b64url: string) => {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** This device's subscription, if reminders are on here. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  const reg = await timeout(navigator.serviceWorker.getRegistration(), 4000, 'service worker').catch(() => undefined);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function save(sub: PushSubscription, prefs: PushPrefs): Promise<void> {
  const { getClient } = await import('../sync/supabase');
  const c = getClient();
  if (!c) throw new Error('Cloud sync is not set up.');
  const keys = sub.toJSON().keys ?? {};
  const { error } = await c.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    p_prefs: prefs,
  });
  if (error) throw new Error(/sign in first/i.test(error.message) ? 'Sign in on the Party tab first.' : error.message);
}

/**
 * Turns reminders on. Call it straight from a tap: iPhones only show the permission prompt for one, and
 * only once (after a refusal it can only be changed in Settings).
 */
export async function enablePush(prefs: PushPrefs): Promise<'on' | 'denied'> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  await subscribe(prefs);
  return 'on';
}

/**
 * Renews the subscription when reminders are wanted, notifications are allowed, but the subscription is
 * gone (iOS drops it after a reinstall or an OS hiccup and never says so). Needs no tap once allowed.
 */
export async function renewPush(prefs: PushPrefs): Promise<boolean> {
  if (pushSupport() !== 'ok' || pushPermission() !== 'granted') return false;
  const sub = await currentSubscription();
  if (sub && sameKey(sub.options.applicationServerKey)) return false;
  await subscribe(prefs); // none, or one made for another sender key (which can never be delivered)
  return true;
}

const sameKey = (a: ArrayBuffer | null | undefined) => {
  const key = keyBytes(VAPID);
  return !!a && a.byteLength === key.length && new Uint8Array(a).every((x, i) => x === key[i]);
};

async function subscribe(prefs: PushPrefs): Promise<void> {
  const reg = await timeout(navigator.serviceWorker.ready, 10_000, 'The app is still installing. Try again in a moment.');
  let sub = await reg.pushManager.getSubscription();
  const key = keyBytes(VAPID);
  if (sub && !sameKey(sub.options.applicationServerKey)) {
    // made for another sender key: it cannot be reused
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await save(sub, prefs);
}

/** Turns reminders off on this device (and forgets it in the cloud, when reachable). */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    const { getClient } = await import('../sync/supabase');
    await getClient()?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  } catch {
    // offline: the sender drops it once the push service reports it gone
  }
  await sub.unsubscribe().catch(() => undefined);
}

/** Sends the current reminder settings and time zone along with this device's subscription, if any. */
export async function updatePushPrefs(prefs: PushPrefs): Promise<void> {
  const sub = await currentSubscription();
  if (sub) await save(sub, prefs);
}

/** Quests left today on the home-screen icon (needs notification permission on iPhone). */
export function setIconBadge(n: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (!nav.setAppBadge || pushPermission() !== 'granted') return;
  try {
    (n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge?.())?.catch(() => undefined);
  } catch {
    // some browsers refuse badges outright
  }
}
