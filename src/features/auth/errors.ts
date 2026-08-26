/**
 * Turning a Supabase auth failure into something the player can read.
 *
 * Appendix A does this for every server error code the database raises. Auth
 * failures come from GoTrue rather than from Postgres, so they need the same
 * treatment: a stable code the app can branch on, and a string key it can
 * show. Nothing ever renders `error.message`, which is English and written for
 * a developer.
 */
import { AuthError } from '@supabase/supabase-js';

/** The auth failures this app distinguishes. */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_in_use'
  | 'weak_password'
  | 'too_many_requests'
  | 'network'
  | 'unknown';

export interface AppAuthError {
  code: AuthErrorCode;
  /** The i18n key the screen renders. */
  messageKey: string;
}

const MESSAGE_KEYS: Record<AuthErrorCode, string> = {
  invalid_credentials: 'error.invalidCredentials',
  // 14.4 does not distinguish a wrong email from a wrong password, and 14.3
  // routes an unconfirmed sign-in back to the verify screen rather than
  // showing this. It exists for the paths that cannot route.
  email_not_confirmed: 'error.confirmEmailFirst',
  email_in_use: 'error.emailInUse',
  weak_password: 'validation.passwordWeak',
  too_many_requests: 'error.tooManyRequests',
  network: 'error.network',
  unknown: 'error.generic',
};

/**
 * GoTrue's own codes, which are stable, mapped first. The message fallbacks
 * below cover older deployments that answer without a `code`.
 */
const CODE_MAP: Record<string, AuthErrorCode> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'email_in_use',
  email_exists: 'email_in_use',
  weak_password: 'weak_password',
  over_email_send_rate_limit: 'too_many_requests',
  over_request_rate_limit: 'too_many_requests',
};

function fromMessage(message: string): AuthErrorCode {
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) return 'invalid_credentials';
  if (text.includes('email not confirmed')) return 'email_not_confirmed';
  if (text.includes('already registered')) return 'email_in_use';
  if (text.includes('password')) return 'weak_password';
  if (text.includes('rate limit') || text.includes('too many')) return 'too_many_requests';
  if (text.includes('network') || text.includes('failed to fetch')) return 'network';
  return 'unknown';
}

export function toAppAuthError(error: unknown): AppAuthError {
  if (error instanceof AuthError) {
    const mapped = error.code === undefined ? undefined : CODE_MAP[error.code];
    const code = mapped ?? fromMessage(error.message);
    return { code, messageKey: MESSAGE_KEYS[code] };
  }

  if (error instanceof TypeError) {
    // fetch rejects with a TypeError when the phone has no connection.
    return { code: 'network', messageKey: MESSAGE_KEYS.network };
  }

  if (error instanceof Error) {
    const code = fromMessage(error.message);
    return { code, messageKey: MESSAGE_KEYS[code] };
  }

  return { code: 'unknown', messageKey: MESSAGE_KEYS.unknown };
}

export function authErrorMessageKey(error: unknown): string {
  return toAppAuthError(error).messageKey;
}

/** Raised in place of GoTrue's silence when an address is already taken. */
export class EmailInUseError extends AuthError {
  constructor() {
    super('Email already registered', 422, 'user_already_exists');
    this.name = 'EmailInUseError';
  }
}
