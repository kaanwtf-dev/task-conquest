// Password-reset links: Supabase sends the player back to the app with the reset session (or an error) in
// the address's #fragment. Read once at startup, before the Supabase client consumes and clears it.
// Our own messages are marked with tk() and translated where they're shown (the language isn't set yet here).
import { tk } from '../i18n';

export type RecoveryLink = { kind: 'reset' } | { kind: 'error'; message: string } | null;

export function readRecoveryLink(hash: string): RecoveryLink {
  if (!hash || hash.length < 2) return null;
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(hash.replace(/^#/, ''));
  } catch {
    return null;
  }
  if (p.get('type') === 'recovery' && p.get('access_token')) return { kind: 'reset' };
  const code = p.get('error_code');
  if (code || p.get('error_description')) {
    return {
      kind: 'error',
      message:
        code === 'otp_expired'
          ? tk('That reset link has expired or was already used.')
          : (p.get('error_description') ?? tk('That link did not work.')).replace(/\+/g, ' ').slice(0, 200),
    };
  }
  return null;
}
