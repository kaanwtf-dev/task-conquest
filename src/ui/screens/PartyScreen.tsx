import { useEffect, useState } from 'react';
import { isForeignList, useStore, visibleLists } from '../../state/store';
import { useSync, joinByCode, resolveConflict, resolveAccountSwitch, restartSync, signOutHere, syncNow } from '../../state/sync';
import { cloudIsBuiltIn, getSyncConfig, setSyncConfig, signIn, signUp } from '../../sync/supabase';
import { createInvite, listParty } from '../../sync/party';
import { iconFor } from '../../pixel/iconGen';
import { heroPix, type Appearance } from '../../pixel/sprites/hero';
import { spriteUrl } from '../../pixel/pix';
import { CLASS_BY_ID } from '../../game/catalog';
import type { ClassId, TaskList } from '../../core/types';
import { BodyPortal, PxImg, themeStyle } from '../components/common';
import { Field } from './TaskEditSheet';
import { sfx } from '../../audio/sfx';

export default function PartyScreen() {
  const sync = useSync();
  return (
    <div className="scroll">
      <div className="win" style={{ padding: 12 }}>
        <div className="win-title">Party & Cloud</div>
        <p style={{ fontSize: 16, lineHeight: 1.4, margin: '8px 0 0' }}>
          Sync your adventure between iPhone and Mac, and share lists (groceries, chores…) with friends and family. Everyone sees checks
          instantly, and whoever completes a quest gets the XP.
        </p>
      </div>
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
      <div className="section-label">Connect a cloud (free)</div>
      <div className="win" style={{ padding: 12 }}>
        <ol style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 15, lineHeight: 1.5 }}>
          <li>Create a free project at supabase.com.</li>
          <li>Open its SQL editor and run the file supabase/schema.sql from this app's repo.</li>
          <li>In Authentication → Providers → Email, turn off "Confirm email" (or confirm via the email link).</li>
          <li>Copy the Project URL and the anon public key from Project Settings → API into the boxes below.</li>
        </ol>
        <Field label="Project URL">
          <input className="text-in" aria-label="Project URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoCapitalize="off" autoCorrect="off" />
        </Field>
        <Field label="Anon public key">
          <input className="text-in" aria-label="Anon public key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" autoCapitalize="off" autoCorrect="off" />
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
            Connect
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
      <div className="section-label">Sign in</div>
      <div className="win" style={{ padding: 12 }}>
        {pending && <p style={{ color: 'var(--accent)', marginTop: 0 }}>Sign in to join party list {pending}.</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => signIn(email.trim(), password));
          }}
        >
          <Field label="Email">
            <input className="text-in" type="email" aria-label="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <input className="text-in" type="password" aria-label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {msg && <p style={{ fontSize: 15 }}>{msg}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn ghost"
              disabled={busy || !email || password.length < 6}
              onClick={() => run(() => signUp(email.trim(), password), 'Account created! If email confirmation is on, confirm it, then sign in here.')}
            >
              Create account
            </button>
            <button className="btn" type="submit" disabled={busy || !email || !password}>
              Sign in
            </button>
          </div>
        </form>
        {!cloudIsBuiltIn() && (
          <button
            className="btn ghost small"
            style={{ marginTop: 12 }}
            onClick={() => {
              if (confirm('Disconnect this cloud project from the app?')) {
                setSyncConfig(null);
                restartSync();
              }
            }}
          >
            Change cloud project
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
    idle: 'All synced',
    syncing: 'Syncing…',
    offline: 'Offline — will sync when back online',
    error: 'Sync error — retrying',
    'signed-out': 'Signed out',
    conflict: 'Paused — waiting for your choice',
    off: 'Off',
  };
  const [signingOut, setSigningOut] = useState(false);
  return (
    <>
      <div className="section-label">Account</div>
      <div className="win" style={{ padding: 12 }}>
        <div className="kv">
          Signed in <b>{sync.email}</b>
        </div>
        <div className="kv">
          Status <b>{statusText[sync.status] ?? sync.status}</b>
        </div>
        {sync.lastSync && (
          <div className="kv">
            Last sync <b>{new Date(sync.lastSync).toLocaleTimeString()}</b>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn small" onClick={() => syncNow()}>
            Sync now
          </button>
          <button
            className="btn ghost small"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await signOutHere();
              } catch (e) {
                alert(e instanceof Error ? e.message : 'Could not sign out. Try again.');
              } finally {
                setSigningOut(false);
              }
            }}
          >
            Sign out
          </button>
        </div>
      </div>
      {sync.joinError && (
        <div className="win" style={{ padding: 12 }} role="alert">
          <div>The invite link didn't work: {sync.joinError}</div>
          <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => useSync.setState({ joinError: null })}>
            OK
          </button>
        </div>
      )}

      <div className="section-label">Join a party list</div>
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
            alert(err instanceof Error ? err.message : 'Could not join — check the code.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Invite code, e.g. K7QX2M" autoCapitalize="characters" aria-label="Invite code" />
        <button className="btn" type="submit" disabled={busy || code.trim().length < 4}>
          Join
        </button>
      </form>

      <div className="section-label">Your lists</div>
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
      .then((m) => alive && setMembers(m as Member[]))
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
      alert(e instanceof Error ? e.message : 'Could not create an invite. Is this list synced yet?');
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async () => {
    if (!invite) return;
    const text = `Join my Questlog party list "${list.name}"! Code: ${invite.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Questlog party', text, url: invite.url });
        return;
      } catch {
        // cancelled
      }
    }
    await navigator.clipboard?.writeText(`${text}\n${invite.url}`);
    alert('Invite copied!');
  };

  const mine = !isForeignList(list, s.accountId ?? myId);
  return (
    <div className="win party-list" style={themeStyle(list.theme)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PxImg src={iconFor(list.name, list.icon)} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div>{list.name}</div>
          <div className="muted small">{list.shared ? `Party list · ${members?.length ?? '…'} members` : 'Private'}</div>
        </div>
        <button className="btn small" disabled={busy} onClick={share}>
          {list.shared ? 'Invite' : 'Share'}
        </button>
      </div>
      {invite && (
        <div className="invite">
          <div className="pixel invite-code">{invite.code}</div>
          <button className="btn small" onClick={shareLink}>
            Send link
          </button>
        </div>
      )}
      {members && members.length > 0 && (
        <div className="members">
          {members.map((m) => (
            <div key={m.userId} className="member" title={`${m.name} · Lv${m.level}`}>
              {m.appearance ? (
                <PxImg
                  src={spriteUrl(`member:${m.userId}:${JSON.stringify(m.appearance)}:${m.classId}`, () =>
                    heroPix(m.appearance!, CLASS_BY_ID[m.classId ?? 'knight']?.look ?? {}),
                  )}
                  size={56}
                />
              ) : (
                <div style={{ width: 56, height: 56 }} />
              )}
              <div className="small">{m.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Lv{m.level} {m.role === 'owner' ? '♛' : ''}
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
            if (confirm(`Leave "${list.name}"? It is removed from this device; the rest of the party keeps it.`)) s.leaveList(list.id);
          }}
        >
          Leave party list
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
      setErr(e instanceof Error && e.message ? e.message : 'Could not reach the cloud. Check your connection and try again.');
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
      <div className="win sheet">
        <div className="win-title">Different account</div>
        <p style={{ fontSize: 16, lineHeight: 1.4 }}>
          This device was last synced with another account. Its hero and lists ({hero?.name ?? 'no hero'}) belong to that account.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={choose(() => resolveAccountSwitch('fresh'))}>
            Start fresh with this account
          </button>
          <button className="btn ghost" disabled={busy} onClick={choose(() => resolveAccountSwitch('bring'))}>
            Bring this device's data into this account
          </button>
        </div>
        {errLine}
      </div>
    ) : (
      <div className="win sheet">
        <div className="win-title">Two heroes found</div>
        <p style={{ fontSize: 16, lineHeight: 1.4 }}>
          The cloud already has <b>{c.cloudName}</b> (Lv{c.cloudLevel}). This device has <b>{hero?.name}</b>. What should happen?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={choose(() => resolveConflict('cloud'))}>
            Use the cloud save on this device
          </button>
          <button className="btn ghost" disabled={busy} onClick={choose(() => resolveConflict('merge'))}>
            Merge both (keep all lists, combine progress)
          </button>
          <button className="btn ghost" disabled={busy} onClick={choose(() => resolveConflict('local'))}>
            Overwrite the cloud with this device
          </button>
        </div>
        {errLine}
      </div>
    );
  // on document.body like every sheet, so iPhone Safari can't clip it to the scrolling Party page
  return (
    <BodyPortal>
      {(zone) => (
        <div className="sheet-back" style={zone}>
          {inner}
        </div>
      )}
    </BodyPortal>
  );
}
