// Reminder notifications: the Options section, the one-time "want reminders?" card, and the bits that
// keep the home-screen badge and the cloud copy of the reminder settings current.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { fx } from '../../state/fx';
import { sum } from '../../game/progression';
import { todayRemaining, todaySections } from '../../state/today';
import { sfx, unlockAudio } from '../../audio/sfx';
import {
  currentSubscription,
  disablePush,
  enablePush,
  forgetSavedAlarms,
  pushPermission,
  pushPrefs,
  pushSupport,
  renewPush,
  saveAlarms,
  setIconBadge,
  updatePushPrefs,
} from '../../push/client';
import type { NudgeKind } from '../../push/nudges';
import { alarmsFor } from '../../push/alarms';
import { useNow } from './common';
import { t, tk } from '../../i18n';

const KIND_LABEL: Record<NudgeKind, string> = {
  plan: tk("today's plan"),
  evening: tk('streak saver'),
  party: tk('party news'),
  comeback: tk('miss-you'),
  deadline: tk('deadlines'),
};
const MORNING = [7, 8, 9, 10];
const EVENING = [18, 19, 20, 21, 22];
/** After "Not now", the card asks again this much later. */
const ASK_AGAIN_MS = 14 * 86_400_000;

/** The signed-in account (undefined while the sync code loads). Sync loads apart from the app shell. */
export function useSignedIn(): string | null | undefined {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    void import('../../state/sync').then(({ useSync }) => {
      if (!alive) return;
      setId(useSync.getState().userId);
      off = useSync.subscribe((s) => setId(s.userId));
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  return id;
}

/** Whether reminders are on for this device (null while checking). */
function useSubscribed(): [boolean | null, (on: boolean) => void] {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    currentSubscription().then((s) => alive && setOn(!!s), () => alive && setOn(false));
    return () => {
      alive = false;
    };
  }, []);
  return [on, setOn];
}

/** Must be called straight from a tap: the permission prompt needs it (see enablePush). */
async function turnOn(account: string): Promise<boolean> {
  try {
    const r = await enablePush(pushPrefs(useStore.getState().settings));
    unlockAudio();
    if (r === 'denied') {
      // a real "Don't Allow" is remembered by the system; anything else can simply be tried again
      const refused = pushPermission() === 'denied';
      useStore.getState().updateSettings({ pushAskedAt: Date.now() });
      fx.emit(
        refused
          ? { type: 'toast', text: t('Notifications are off'), small: t('Turn them on in Settings › Notifications › Task Conquest.') }
          : { type: 'toast', text: t('No reminders yet'), small: t('Tap Turn on again and choose Allow.') },
      );
      return false;
    }
    useStore.getState().updateSettings({ pushAccount: account });
    sfx.loot();
    fx.emit({ type: 'toast', text: t('REMINDERS ON'), small: t('Your hero will nudge you, never more than twice a day.') });
    return true;
  } catch (e) {
    fx.emit({ type: 'toast', text: t('Could not turn reminders on'), small: e instanceof Error ? e.message : undefined });
    return false;
  }
}

/** When the scheduled sender last ran (null: never; undefined: unknown), so a stalled setup gets noticed. */
function useLastRun(userId: string | null | undefined): number | null | undefined {
  const [at, setAt] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void import('../../sync/supabase').then(async ({ getClient }) => {
      const { data, error } = (await getClient()?.rpc('reminders_last_run')) ?? { data: null, error: true };
      if (alive && !error) setAt(data ? Date.parse(data as string) : null);
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  return at;
}

function ago(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min < 2
    ? t('just now')
    : min < 90
      ? t('{n} min ago', { n: min })
      : min < 48 * 60
        ? t('{n} h ago', { n: Math.round(min / 60) })
        : t('{n} days ago', { n: Math.round(min / 1440) });
}

/** Shows a sample right here, without the cloud: checks this device can display reminders at all. */
async function preview() {
  sfx.tick();
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(t('🔥 Your 3-day streak is on the line'), {
      body: t('Finish one quest before the day resets to keep it alive. (This is a preview.)'),
      tag: 'taskconquest-preview',
      icon: `${import.meta.env.BASE_URL}icon-192.png`,
    });
  } catch {
    fx.emit({ type: 'toast', text: t('Could not show a preview') });
  }
}

export function RemindersOption() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const userId = useSignedIn();
  const [on, setOn] = useSubscribed();
  const [busy, setBusy] = useState(false);
  const lastRun = useLastRun(on ? userId : null);
  const support = pushSupport();
  const prefs = pushPrefs(settings);
  const setPush = (p: Partial<NonNullable<typeof settings.push>>) => {
    sfx.tick();
    update({ push: { morningHour: prefs.morningHour, eveningHour: prefs.eveningHour, off: prefs.off, ...p } });
  };

  let note: string | null = null;
  if (support === 'install') note = t('Add Task Conquest to your Home Screen first (Share › Add to Home Screen), then turn reminders on there.');
  else if (support === 'unsupported') note = t('This browser cannot show reminders.');
  else if (userId === null) note = t('Sign in on the Party tab first: reminders come from the cloud.');
  else if (pushPermission() === 'denied') note = t('Notifications are blocked for Task Conquest. Allow them in Settings › Notifications › Task Conquest.');

  return (
    <div className="reminders">
      <div className="reminders-head">
        <span>{on ? t('Reminders are on.') : t('A morning plan and an evening streak saver from your hero, never more than twice a day.')}</span>
        {/* turning off always works, signed in or not; turning on needs everything in place */}
        {(on || (!note && on !== null && userId)) && (
          <button
            className={`btn small ${on ? 'ghost' : ''}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (on) {
                update({ pushAccount: undefined });
                await disablePush();
                setOn(false);
              } else if (userId) setOn(await turnOn(userId));
              setBusy(false);
            }}
          >
            {on ? t('Turn off') : t('Turn on')}
          </button>
        )}
      </div>
      {note && <div className="muted small reminders-note">{note}</div>}
      {/* settings only reach the reminder service while signed in */}
      {on && userId && (
        <>
          <div className="reminders-row">
            <span className="muted small reminders-status">
              {lastRun === undefined
                ? ''
                : lastRun === null
                  ? t('The reminder service has not run yet (it needs a one-time setup in Supabase).')
                  : Date.now() - lastRun > 3 * 3600_000
                    ? t('The reminder service last ran {ago}: check its schedule in Supabase.', { ago: ago(Date.now() - lastRun) })
                    : t('Reminder service checked {ago}.', { ago: ago(Date.now() - lastRun) })}
            </span>
            <button className="pill" onClick={() => void preview()}>
              {t('preview')}
            </button>
          </div>
          <div className="reminders-row">
            <span className="muted small">{t('Morning')}</span>
            {MORNING.map((h) => (
              <button key={h} className={`pill ${prefs.morningHour === h ? 'sel' : ''}`} aria-pressed={prefs.morningHour === h} onClick={() => setPush({ morningHour: h })}>
                {h}:00
              </button>
            ))}
          </div>
          <div className="reminders-row">
            <span className="muted small">{t('Evening')}</span>
            {EVENING.map((h) => (
              <button key={h} className={`pill ${prefs.eveningHour === h ? 'sel' : ''}`} aria-pressed={prefs.eveningHour === h} onClick={() => setPush({ eveningHour: h })}>
                {h}:00
              </button>
            ))}
          </div>
          <div className="reminders-row">
            {(Object.keys(KIND_LABEL) as NudgeKind[]).map((k) => {
              const enabled = !prefs.off.includes(k);
              return (
                <button
                  key={k}
                  className={`pill ${enabled ? 'sel' : ''}`}
                  aria-pressed={enabled}
                  onClick={() => setPush({ off: enabled ? [...prefs.off, k] : prefs.off.filter((x) => x !== k) })}
                >
                  {enabled ? '✓ ' : ''}
                  {t(KIND_LABEL[k])}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** A one-time card on the quest screen once the player is into it: "want reminders?" (never the system prompt cold). */
export function PushInvite() {
  const done = useStore((s) => (s.hero ? sum(s.hero.tasksDone) : 0));
  const askedAt = useStore((s) => s.settings.pushAskedAt ?? 0);
  const update = useStore((s) => s.updateSettings);
  const userId = useSignedIn();
  const [on, setOn] = useSubscribed();
  const [busy, setBusy] = useState(false);
  const show =
    done >= 3 && Date.now() - askedAt > ASK_AGAIN_MS && pushSupport() === 'ok' && pushPermission() === 'default' && !!userId && on === false;
  if (!show) return null;
  return (
    <div className="win push-invite" role="region" aria-label={t('Reminders')}>
      <div className="push-invite-icon" aria-hidden>
        🔔
      </div>
      <div className="push-invite-text">
        <b>{t('Want a nudge from your hero?')}</b>
        <span>{t('A morning plan and an evening streak saver. Never more than twice a day.')}</span>
      </div>
      <div className="push-invite-actions">
        <button
          className="btn small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setOn(await turnOn(userId));
            setBusy(false);
          }}
        >
          {t('Yes!')}
        </button>
        <button
          className="btn ghost small"
          onClick={() => {
            sfx.tick();
            update({ pushAskedAt: Date.now() });
          }}
        >
          {t('Not now')}
        </button>
      </div>
    </div>
  );
}

/**
 * No UI: keeps the home-screen badge at today's quests left (while reminders are on), and the cloud's copy
 * of this device's reminder settings (times, kinds, day start, time zone) current.
 */
export function PushKeeper() {
  const lists = useStore((s) => s.lists);
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const userId = useSignedIn();
  const now = useNow(60_000);
  const hour = Math.floor(now / 3_600_000); // re-counted at least hourly (a new day resets the dailies)
  const account = settings.pushAccount;
  const mine = !!userId && account === userId;

  useEffect(() => {
    if (mine) setIconBadge(todayRemaining(todaySections(lists, tasks, Date.now(), settings)));
  }, [mine, lists, tasks, settings.dayStartHour, settings.weekStart, hour]);

  // the session ended without a sign-out (expired or revoked): this device stops getting that account's
  // reminders; signing back in as it brings them back
  const was = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (was.current && userId === null) void disablePush().catch(() => undefined);
    if (userId !== undefined) was.current = userId;
  }, [userId]);

  // every launch (and every settings change) re-saves the device: its time zone may have changed, the
  // sender prunes devices it has not heard from in months, and iOS may have dropped the subscription
  const key = JSON.stringify(pushPrefs(settings));
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(() => {
      const prefs = JSON.parse(key);
      void (mine ? renewPush(prefs) : Promise.resolve(false))
        .then((renewed) => (renewed || !mine ? undefined : updatePushPrefs(prefs)))
        .catch(() => undefined);
    }, 1500);
    return () => clearTimeout(timer);
  }, [key, userId, mine]);

  // deadline notifications: the moments they are due, kept in the cloud for the minute job (push/alarms.ts),
  // from any signed-in device (the one getting the notification may not be the one the quest was set on)
  const hero = useStore((s) => s.hero);
  useEffect(() => {
    if (!userId) {
      forgetSavedAlarms();
      return;
    }
    const timer = setTimeout(() => {
      const at = Date.now();
      const alarms = alarmsFor({ hero, lists, tasks }, at, settings, pushPrefs(settings));
      void saveAlarms(alarms).catch(() => undefined);
    }, 3000);
    return () => clearTimeout(timer);
  }, [userId, hero ? hero.name : null, lists, tasks, settings, hour]);
  return null;
}
