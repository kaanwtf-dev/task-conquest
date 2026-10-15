// Reminder notifications: the Options section, the one-time "want reminders?" card, and the bits that
// keep the home-screen badge and the cloud copy of the reminder settings current.
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { fx } from '../../state/fx';
import { sum } from '../../game/progression';
import { todayRemaining, todaySections } from '../../state/today';
import { sfx, unlockAudio } from '../../audio/sfx';
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushPermission,
  pushPrefs,
  pushSupport,
  renewPush,
  setIconBadge,
  updatePushPrefs,
} from '../../push/client';
import type { NudgeKind } from '../../push/nudges';
import { useNow } from './common';

const KIND_LABEL: Record<NudgeKind, string> = {
  plan: "today's plan",
  evening: 'streak saver',
  party: 'party news',
  comeback: 'miss-you',
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
async function turnOn(): Promise<boolean> {
  try {
    const r = await enablePush(pushPrefs(useStore.getState().settings));
    unlockAudio();
    if (r === 'denied') {
      // a real "Don't Allow" is remembered by the system; anything else can simply be tried again
      const refused = pushPermission() === 'denied';
      useStore.getState().updateSettings({ pushAskedAt: Date.now() });
      fx.emit(
        refused
          ? { type: 'toast', text: 'Notifications are off', small: 'Turn them on in Settings › Notifications › Questlog.' }
          : { type: 'toast', text: 'No reminders yet', small: 'Tap Turn on again and choose Allow.' },
      );
      return false;
    }
    useStore.getState().updateSettings({ pushWanted: true });
    sfx.loot();
    fx.emit({ type: 'toast', text: 'REMINDERS ON', small: 'Your hero will nudge you, never more than twice a day.' });
    return true;
  } catch (e) {
    fx.emit({ type: 'toast', text: 'Could not turn reminders on', small: e instanceof Error ? e.message : undefined });
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
  return min < 2 ? 'just now' : min < 90 ? `${min} min ago` : min < 48 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
}

/** Shows a sample right here, without the cloud: checks this device can display reminders at all. */
async function preview() {
  sfx.tick();
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('🔥 Your 3-day streak is on the line', {
      body: 'Finish one quest before the day resets to keep it alive. (This is a preview.)',
      tag: 'questlog-preview',
      icon: `${import.meta.env.BASE_URL}icon-192.png`,
    });
  } catch {
    fx.emit({ type: 'toast', text: 'Could not show a preview' });
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
  if (support === 'install') note = 'Add Questlog to your Home Screen first (Share › Add to Home Screen), then turn reminders on there.';
  else if (support === 'unsupported') note = 'This browser cannot show reminders.';
  else if (userId === null) note = 'Sign in on the Party tab first: reminders come from the cloud.';
  else if (pushPermission() === 'denied') note = 'Notifications are blocked for Questlog. Allow them in Settings › Notifications › Questlog.';

  return (
    <div className="reminders">
      <div className="reminders-head">
        <span>{on ? 'Reminders are on.' : 'A morning plan and an evening streak saver from your hero, never more than twice a day.'}</span>
        {!note && on !== null && (
          <button
            className={`btn small ${on ? 'ghost' : ''}`}
            disabled={busy || userId === undefined}
            onClick={async () => {
              setBusy(true);
              if (on) {
                update({ pushWanted: false });
                await disablePush();
                setOn(false);
              } else setOn(await turnOn());
              setBusy(false);
            }}
          >
            {on ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>
      {note && <div className="muted small reminders-note">{note}</div>}
      {on && (
        <>
          <div className="reminders-row">
            <span className="muted small reminders-status">
              {lastRun === undefined
                ? ''
                : lastRun === null
                  ? 'The reminder service has not run yet (it needs a one-time setup on GitHub).'
                  : Date.now() - lastRun > 3 * 3600_000
                    ? `The reminder service last ran ${ago(Date.now() - lastRun)}: it may be switched off on GitHub.`
                    : `Reminder service checked ${ago(Date.now() - lastRun)}.`}
            </span>
            <button className="pill" onClick={() => void preview()}>
              preview
            </button>
          </div>
          <div className="reminders-row">
            <span className="muted small">Morning</span>
            {MORNING.map((h) => (
              <button key={h} className={`pill ${prefs.morningHour === h ? 'sel' : ''}`} aria-pressed={prefs.morningHour === h} onClick={() => setPush({ morningHour: h })}>
                {h}:00
              </button>
            ))}
          </div>
          <div className="reminders-row">
            <span className="muted small">Evening</span>
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
                  {KIND_LABEL[k]}
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
    <div className="win push-invite" role="region" aria-label="Reminders">
      <div className="push-invite-icon" aria-hidden>
        🔔
      </div>
      <div className="push-invite-text">
        <b>Want a nudge from your hero?</b>
        <span>A morning plan and an evening streak saver. Never more than twice a day.</span>
      </div>
      <div className="push-invite-actions">
        <button
          className="btn small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setOn(await turnOn());
            setBusy(false);
          }}
        >
          Yes!
        </button>
        <button
          className="btn ghost small"
          onClick={() => {
            sfx.tick();
            update({ pushAskedAt: Date.now() });
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

/**
 * No UI: keeps the home-screen badge at today's quests left, and the cloud's copy of this device's reminder
 * settings (times, kinds, day start, time zone) current while reminders are on.
 */
export function PushKeeper() {
  const lists = useStore((s) => s.lists);
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const userId = useSignedIn();
  const now = useNow(60_000);
  const day = Math.floor(now / 3_600_000); // re-counted at least hourly (a new day resets the dailies)

  useEffect(() => {
    setIconBadge(todayRemaining(todaySections(lists, tasks, Date.now(), settings)));
  }, [lists, tasks, settings.dayStartHour, settings.weekStart, day]);

  // every launch (and every settings change) re-saves the device: its time zone may have changed, the
  // sender prunes devices it has not heard from in months, and iOS may have dropped the subscription
  const key = JSON.stringify(pushPrefs(settings));
  const wanted = !!settings.pushWanted;
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => {
      const prefs = JSON.parse(key);
      void (wanted ? renewPush(prefs) : Promise.resolve(false))
        .then((renewed) => (renewed ? undefined : updatePushPrefs(prefs)))
        .catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [key, userId, wanted]);
  return null;
}
