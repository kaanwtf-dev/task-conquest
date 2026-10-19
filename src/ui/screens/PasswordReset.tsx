// The page a password-reset email opens: choose a new password, then sign in with it in the app.
import { useState } from 'react';
import type { RecoveryLink } from '../../sync/recovery';

const home = () => {
  const env = import.meta.env as Record<string, unknown>;
  location.replace(`${location.origin}${typeof env.BASE_URL === 'string' ? env.BASE_URL : '/'}`);
};

export default function PasswordReset({ link }: { link: NonNullable<RecoveryLink> }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(link.kind === 'error' ? link.message : null);
  const [done, setDone] = useState(false);
  const mismatch = again.length > 0 && again !== password;

  return (
    <div className="reset-page">
      <div className="win reset-win">
        <div className="win-title">{done ? 'Password changed' : link.kind === 'error' ? 'Link problem' : 'Choose a new password'}</div>
        {done ? (
          <p>All set. Open Task Conquest and sign in on the Party tab with your email and new password (on iPhone, from the Home Screen icon).</p>
        ) : link.kind === 'error' ? (
          <p>{msg} Ask for a new one: Party tab › Sign in › Forgot password?</p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMsg(null);
              try {
                const { setNewPassword } = await import('../../sync/supabase');
                await setNewPassword(password);
                setDone(true);
              } catch (err) {
                setMsg(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="reset-field">
              New password (at least 6 characters)
              <input className="text-in" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="reset-field">
              Type it again
              <input className="text-in" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
            </label>
            {mismatch && <p className="reset-msg">The two don't match yet.</p>}
            {msg && <p className="reset-msg">{msg}</p>}
            <button className="btn" type="submit" disabled={busy || password.length < 6 || again !== password}>
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}
        <button className="btn ghost small" style={{ marginTop: 14 }} onClick={home}>
          Back to Task Conquest
        </button>
      </div>
    </div>
  );
}
