/**
 * Auth failures reaching the player as copy he can act on.
 *
 * The two that carry weight beyond their message are `email_in_use`, which
 * 14.2 pairs with a *Sign in instead* link, and `email_not_confirmed`, which
 * sends him to the verify screen rather than showing an error at all.
 */
import { AuthError } from '@supabase/supabase-js';

import { EmailInUseError, authErrorMessageKey, toAppAuthError } from '../errors';

function authError(message: string, code?: string): AuthError {
  return new AuthError(message, 400, code);
}

describe('toAppAuthError', () => {
  it.each([
    ['invalid_credentials', 'invalid_credentials', 'error.invalidCredentials'],
    ['email_not_confirmed', 'email_not_confirmed', 'error.confirmEmailFirst'],
    ['user_already_exists', 'email_in_use', 'error.emailInUse'],
    ['email_exists', 'email_in_use', 'error.emailInUse'],
    ['weak_password', 'weak_password', 'validation.passwordWeak'],
    ['over_email_send_rate_limit', 'too_many_requests', 'error.tooManyRequests'],
    ['over_request_rate_limit', 'too_many_requests', 'error.tooManyRequests'],
  ])('maps the GoTrue code %s', (code, expectedCode, expectedKey) => {
    const mapped = toAppAuthError(authError('anything', code));
    expect(mapped.code).toBe(expectedCode);
    expect(mapped.messageKey).toBe(expectedKey);
  });

  it.each([
    ['Invalid login credentials', 'invalid_credentials'],
    ['Email not confirmed', 'email_not_confirmed'],
    ['User already registered', 'email_in_use'],
  ])('falls back to the message when there is no code: %p', (message, expectedCode) => {
    expect(toAppAuthError(authError(message)).code).toBe(expectedCode);
  });

  it('treats a fetch failure as a lost connection', () => {
    expect(toAppAuthError(new TypeError('Network request failed')).code).toBe('network');
  });

  it('never leaves an unknown failure without a message', () => {
    const mapped = toAppAuthError(new Error('something nobody predicted'));
    expect(mapped.code).toBe('unknown');
    expect(mapped.messageKey).toBe('error.generic');
  });

  it.each([null, undefined, 'a string', 42, {}])('survives %p', (value) => {
    expect(toAppAuthError(value).messageKey).toBe('error.generic');
  });

  it('never returns a raw server message, only a key', () => {
    const mapped = toAppAuthError(authError('Invalid login credentials'));
    expect(mapped.messageKey).not.toContain(' ');
    expect(mapped.messageKey).toMatch(/^[a-z]+\.[A-Za-z]+$/);
  });
});

describe('EmailInUseError', () => {
  it('is indistinguishable from GoTrue answering with the code itself', () => {
    // A project that hides which addresses exist answers a duplicate sign-up
    // with a silent success. api.signUp raises this instead, and 14.2's
    // "Sign in instead" link depends on it mapping the same way.
    expect(toAppAuthError(new EmailInUseError()).code).toBe('email_in_use');
    expect(authErrorMessageKey(new EmailInUseError())).toBe('error.emailInUse');
  });
});
