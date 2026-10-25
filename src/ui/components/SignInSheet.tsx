// "Already playing? Sign in": for a player on a new device (or the new Home Screen app) whose hero is in the
// cloud. With no hero on this device yet, signing in brings the cloud hero straight here (state/sync.ts).
// The cloud code loads only when it is used, so the hero-creation screen stays light.
import { useState } from 'react';
import { Sheet } from './common';
import { Field } from '../screens/TaskEditSheet';
import { sfx } from '../../audio/sfx';
import { t } from '../../i18n';

/** Waits for the first sync after signing in: true when it finished, false when it gave up (offline, an error). */
async function synced(timeoutMs = 20_000): Promise<boolean> {
  const { useSync } = await import('../../state/sync');
  return new Promise((done) => {
    let saw = false;
    const timer = setTimeout(() => (off(), done(false)), timeoutMs);
    const off = useSync.subscribe((s) => {
      if (s.status === 'syncing') saw = true;
      else if (saw || s.status === 'idle') {
        clearTimeout(timer);
        off();
        done(s.status === 'idle');
      }
    });
  });
}

export function SignInSheet({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const signInNow = async () => {
    setBusy(true);
    setMsg(t('Signing in…'));
    try {
      const { signIn } = await import('../../sync/supabase');
      const done = synced();
      await signIn(email.trim(), password);
      const ok = await done;
      sfx.loot();
      // with a hero in the cloud, it is already on this device and this screen is gone
      setMsg(ok ? t('Signed in, but this account has no hero yet. Close this and create one: it will be saved to your account.') : t('Signed in. Your hero will appear as soon as the cloud answers.'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const forgot = async () => {
    if (!email.trim()) return setMsg(t('Type your email above first, then tap "Forgot password?".'));
    setBusy(true);
    try {
      const { requestPasswordReset } = await import('../../sync/supabase');
      await requestPasswordReset(email.trim());
      setMsg(t('Sent! Open the email to {email}, choose a new password, then sign in here with it.', { email: email.trim() }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} className="signin-sheet">
      <div className="win-title">{t('Already playing? Sign in')}</div>
      <p className="muted small" style={{ marginTop: 4 }}>
        {t('Your hero, quests and gold come back from your account.')}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void signInNow();
        }}
      >
        <Field label={t('Email')}>
          <input className="text-in" type="email" aria-label={t('Email')} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('Password')}>
          <input className="text-in" type="password" aria-label={t('Password')} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {msg && <p style={{ fontSize: 15 }}>{msg}</p>}
        <button type="button" className="link-btn" disabled={busy} onClick={() => void forgot()}>
          {t('Forgot password?')}
        </button>
        <div className="sheet-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button className="btn" type="submit" disabled={busy || !email || !password}>
            {t('Sign in')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
