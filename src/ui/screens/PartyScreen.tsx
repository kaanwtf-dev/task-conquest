import { useEffect, useState } from 'react';
import { isForeignList, useStore, visibleLists } from '../../state/store';
import { useSync, joinByCode, resolveConflict, resolveAccountSwitch, restartSync, signOutHere, syncNow } from '../../state/sync';
import { cloudIsBuiltIn, getSyncConfig, requestPasswordReset, setSyncConfig, signIn, signUp } from '../../sync/supabase';
import { createInvite, listParty } from '../../sync/party';
import { iconFor } from '../../pixel/iconGen';
import type { Appearance } from '../../pixel/sprites/hero';
import { memberSprite } from '../components/PartyStrip';
import { partyRoster } from '../partyRoster';
import type { ClassId, TaskList } from '../../core/types';
import { PxImg, Sheet, rich, themeStyle } from '../components/common';
import { Field } from './TaskEditSheet';
import Leaderboard from '../components/Leaderboard';
import { sfx } from '../../audio/sfx';
import { locale, t } from '../../i18n';

export default function PartyScreen() {
  const sync = useSync();
  return (
    <div className="scroll">
      <div className="win" style={{ padding: 12 }}>
        <div className="win-title">{t('Party & Cloud')}</div>
        <p style={{ fontSize: 16, lineHeight: 1.4, margin: '8px 0 0' }}>
          {t(
            'Sync your adventure between iPhone and Mac, and share lists (groceries, chores…) with friends and family. Everyone sees checks instantly, and whoever completes a quest gets the XP.',
          )}
        </p>
      </div>
      {sync.status !== 'off' && sync.userId && <Leaderboard />}
      {sync.status === 'off' ? <SetupCard /> : sync.userId ? <SignedIn /> : <AuthCard />}
      {sync.conflict && <ConflictSheet />}
    </div>
  );
}

function SetupCard() {
  const cfg = getSyncConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.anonKey ?? '');
  return (
    <>
      <div className="section-label">{t('Connect a cloud (free)')}</div>
      <div className="win" style={{ padding: 12 }}>
        <ol style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 15, lineHeight: 1.5 }}>
          <li>{t('Create a free project at supabase.com.')}</li>
          <li>{t("Open its SQL editor and run the file supabase/schema.sql from this app's repo.")}</li>
          <li>{t('In Authentication → Providers → Email, turn off "Confirm email" (or confirm via the email link).')}</li>
          <li>{t('Copy the Project URL and the anon public key from Project Settings → API into the boxes below.')}</li>
        </ol>
        <Field label={t('Project URL')}>
          <input className="text-in" aria-label={t('Project URL')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoCapitalize="off" autoCorrect="off" />
        </Field>
        <Field label={t('Anon public key')}>
          <input className="text-in" aria-label={t('Anon public key')} value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" autoCapitalize="off" autoCorrect="off" />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            className="btn"
            disabled={!/^https:\/\/.+/.test(url.trim()) || key.trim().length < 20}
            onClick={() => {
              setSyncConfig({ url: url.trim().replace(/\/+$/, ''), anonKey: key.trim() });
              restartSync();
              sfx.loot();
            }}
          >
            {t('Connect')}
          </button>
        </div>
      </div>
    </>
  );
}

function AuthCard() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const pending = useSync((s) => s.pendingJoin);
  return (
    <>
      <div className="section-label">{t('Sign in')}</div>
      <div className="win" style={{ padding: 12 }}>
        {pending && <p style={{ color: 'var(--accent)', marginTop: 0 }}>{t('Sign in to join party list {code}.', { code: pending })}</p>}
        <p className="backup-note">
          ⚠️ <b>{t('Not backed up!')}</b>{' '}
          {t('Right now your save lives only on this device. A free account keeps it safe in the cloud and lets you play on your other devices too.')}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => signIn(email.trim(), password));
          }}
        >
          <Field label={t('Email')}>
            <input className="text-in" type="email" aria-label={t('Email')} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('Password')}>
            <input className="text-in" type="password" aria-label={t('Password')} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {msg && <p style={{ fontSize: 15 }}>{msg}</p>}
          <button
            type="button"
            className="link-btn"
            disabled={busy}
            onClick={() =>
              email.trim()
                ? run(() => requestPasswordReset(email.trim()), t('Sent! Open the email to {email}, choose a new password, then sign in here with it.', { email: email.trim() }))
                : setMsg(t('Type your email above first, then tap "Forgot password?".'))
            }
          >
            {t('Forgot password?')}
          </button>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn ghost"
              disabled={busy || !email || password.length < 6}
              onClick={() => run(() => signUp(email.trim(), password), t('Account created! If email confirmation is on, confirm it, then sign in here.'))}
            >
              {t('Create account')}
            </button>
            <button className="btn" type="submit" disabled={busy || !email || !password}>
              {t('Sign in')}
            </button>
          </div>
        </form>
        {!cloudIsBuiltIn() && (
          <button
            className="btn ghost small"
            style={{ marginTop: 12 }}
            onClick={() => {
              if (confirm(t('Disconnect this cloud project from the app?'))) {
                setSyncConfig(null);
                restartSync();
              }
            }}
          >
            {t('Change cloud project')}
          </button>
        )}
      </div>
    </>
  );
}

function SignedIn() {
  const sync = useSync();
  const s = useStore();
  const lists = visibleLists(s);
  const [code, setCode] = useState(sync.pendingJoin ?? '');
  const [busy, setBusy] = useState(false);
  const statusText: Record<string, string> = {
    idle: t('All synced'),
    syncing: t('Syncing…'),
    offline: t('Offline — will sync when back online'),
    error: t('Sync error — retrying'),
    'signed-out': t('Signed out'),
    conflict: t('Paused — waiting for your choice'),
    off: t('Off'),
  };
  const [signingOut, setSigningOut] = useState(false);
  return (
    <>
      <div className="section-label">{t('Account')}</div>
      <div className="win" style={{ padding: 12 }}>
        <div className="kv">
          {t('Signed in')} <b>{sync.email}</b>
        </div>
        <div className="kv">
          {t('Status')} <b>{statusText[sync.status] ?? sync.status}</b>
        </div>
        {sync.lastSync && (
          <div className="kv">
            {t('Last sync')} <b>{new Date(sync.lastSync).toLocaleTimeString(locale())}</b>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn small" onClick={() => syncNow()}>
            {t('Sync now')}
          </button>
          <button
            className="btn ghost small"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await signOutHere();
              } catch (e) {
                alert(e instanceof Error ? e.message : t('Could not sign out. Try again.'));
              } finally {
                setSigningOut(false);
              }
            }}
          >
            {t('Sign out')}
          </button>
        </div>
      </div>
      {sync.joinError && (
        <div className="win" style={{ padding: 12 }} role="alert">
          <div>{t("The invite link didn't work: {error}", { error: sync.joinError })}</div>
          <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => useSync.setState({ joinError: null })}>
            {t('OK')}
          </button>
        </div>
      )}

      <div className="section-label">{t('Join a party list')}</div>
      <form
        className="win quick-add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!code.trim()) return;
          setBusy(true);
          try {
            await joinByCode(code);
            setCode('');
            sfx.questComplete();
          } catch (err) {
            alert(err instanceof Error ? err.message : t('Could not join — check the code.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('Invite code, e.g. K7QX2M')} autoCapitalize="characters" aria-label={t('Invite code')} />
        <button className="btn" type="submit" disabled={busy || code.trim().length < 4}>
          {t('Join')}
        </button>
      </form>

      <div className="section-label">{t('Your lists')}</div>
      {lists.map((l) => (
        <ListParty key={l.id} list={l} />
      ))}
    </>
  );
}

interface Member {
  userId: string;
  role: string;
  name: string;
  level: number;
  appearance?: Appearance;
  classId?: ClassId;
}

function ListParty({ list }: { list: TaskList }) {
  const s = useStore();
  const myId = useSync((st) => st.userId);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invite, setInvite] = useState<{ code: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!list.shared) return;
    let alive = true;
    listParty(list.id)
      .then((m) => {
        partyRoster.set(list.id, m); // the heroes strip on the list's own screen shows the same party
        if (alive) setMembers(m as Member[]);
      })
      .catch(() => alive && setMembers([]));
    return () => {
      alive = false;
    };
  }, [list.id, list.shared]);

  const share = async () => {
    setBusy(true);
    try {
      const inv = await createInvite(list.id);
      setInvite(inv);
      s.updateList(list.id, { shared: true, ownerId: list.ownerId ?? myId ?? undefined });
      sfx.loot();
    } catch (e) {
      alert(e instanceof Error ? e.message : t('Could not create an invite. Is this list synced yet?'));
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async () => {
    if (!invite) return;
    const text = t('Join my Task Conquest party list "{name}"! Code: {code}', { name: list.name, code: invite.code });
    if (navigator.share) {
      try {
        await navigator.share({ title: t('Task Conquest party'), text, url: invite.url });
        return;
      } catch {
        // cancelled
      }
    }
    await navigator.clipboard?.writeText(`${text}\n${invite.url}`);
    alert(t('Invite copied!'));
  };

  const mine = !isForeignList(list, s.accountId ?? myId);
  return (
    <div className="win party-list" style={themeStyle(list.theme)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PxImg src={iconFor(list.name, list.icon)} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div>{list.name}</div>
          <div className="muted small">{list.shared ? t('Party list · {n} members', { n: members?.length ?? '…' }) : t('Private')}</div>
        </div>
        <button className="btn small" disabled={busy} onClick={share}>
          {list.shared ? t('Invite') : t('Share')}
        </button>
      </div>
      {invite && (
        <div className="invite">
          <div className="pixel invite-code">{invite.code}</div>
          <button className="btn small" onClick={shareLink}>
            {t('Send link')}
          </button>
        </div>
      )}
      {members && members.length > 0 && (
        <div className="members">
          {members.map((m) => (
            <div key={m.userId} className="member" title={t('{name} · Lv{level}', { name: m.name, level: m.level })}>
              {memberSprite(m) ? <PxImg src={memberSprite(m)!} size={56} /> : <div style={{ width: 56, height: 56 }} />}
              <div className="small">{m.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {t('Lv{level}', { level: m.level })} {m.role === 'owner' ? '♛' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {list.shared && !mine && (
        <button
          className="btn ghost small"
          style={{ marginTop: 8 }}
          onClick={() => {
            // removed here at once; the server is told now, or when this device is back online
            if (confirm(t('Leave "{name}"? It is removed from this device; the rest of the party keeps it.', { name: list.name }))) {
              partyRoster.drop(list.id);
              s.leaveList(list.id);
            }
          }}
        >
          {t('Leave party list')}
        </button>
      )}
    </div>
  );
}

function ConflictSheet() {
  const c = useSync((s) => s.conflict)!;
  const hero = useStore((s) => s.hero);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // one choice at a time; a failed one (offline) leaves the sheet up with the reason
  const choose = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : t('Could not reach the cloud. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };
  const errLine = err && (
    <p role="alert" style={{ fontSize: 15, color: '#ff8a80' }}>
      {err}
    </p>
  );
  const inner =
    c.kind === 'account' ? (
      <>
        <div className="win-title">{t('Different account')}</div>
        <p style={{ fontSize: 16, lineHeight: 1.4 }}>
          {t('This device was last synced with another account. Its hero and lists ({name}) belong to that account.', {
            name: hero?.name ?? t('no hero'),
          })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={choose(() => resolveAccountSwitch('fresh'))}>
            {t('Start fresh with this account')}
          </button>
          <button className="btn ghost" disabled={busy} onClick={choose(() => resolveAccountSwitch('bring'))}>
            {t("Bring this device's data into this account")}
          </button>
        </div>
        {errLine}
      </>
    ) : (
      <>
        <div className="win-title">{t('Two heroes found')}</div>
        <p style={{ fontSize: 16, lineHeight: 1.4 }}>
          {rich(t('The cloud already has {cloud} (Lv{level}). This device has {hero}. What should happen?', { level: c.cloudLevel }), {
            cloud: <b>{c.cloudName}</b>,
            hero: <b>{hero?.name}</b>,
          })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={choose(() => resolveConflict('cloud'))}>
            {t('Use the cloud save on this device')}
          </button>
          <button className="btn ghost" disabled={busy} onClick={choose(() => resolveConflict('merge'))}>
            {t('Merge both (keep all lists, combine progress)')}
          </button>
          <button className="btn ghost" disabled={busy} onClick={choose(() => resolveConflict('local'))}>
            {t('Overwrite the cloud with this device')}
          </button>
        </div>
        {errLine}
      </>
    );
  // a full sheet (dialog semantics, focus kept inside), but one that can't be dismissed: a choice is required
  return <Sheet onClose={() => undefined}>{inner}</Sheet>;
}
