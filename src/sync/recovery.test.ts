import { describe, expect, it } from 'vitest';
import { readRecoveryLink } from './recovery';

describe('password reset links', () => {
  it('spots a reset session coming back from the email', () => {
    expect(readRecoveryLink('#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery')).toEqual({ kind: 'reset' });
  });
  it('explains a link that expired', () => {
    expect(readRecoveryLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toEqual({
      kind: 'error',
      message: 'That reset link has expired or was already used.',
    });
  });
  it('leaves other links alone', () => {
    expect(readRecoveryLink('')).toBeNull();
    expect(readRecoveryLink('#join=K7XQ2M')).toBeNull();
    expect(readRecoveryLink('#lab')).toBeNull();
    expect(readRecoveryLink('#access_token=abc&type=signup')).toBeNull();
  });
});
