/**
 * Every auth call the app makes. Nothing else talks to `supabase.auth`.
 *
 * BUILD-SPEC 14.2 to 14.5, 14.14 and D10 to D13.
 */
import type { Session } from '@supabase/supabase-js';

import i18n from '@/i18n';
import { config } from '@/lib/config';
import { AUTH_STORAGE_KEY, supabase } from '@/lib/supabase';
import { clearSecureKey } from '@/lib/secureStorage';

import { EmailInUseError, InvalidCodeError, toAppAuthError } from './errors';
import type {
  AuthUser,
  SignInInput,
  SignUpInput,
  SignUpResult,
  VerifyEmailCodeInput,
} from './types';

export function toAuthUser(session: Session | null): AuthUser | null {
  const user = session?.user;
  if (user === undefined || user.email === undefined) return null;
  return {
    id: user.id,
    email: user.email,
    isEmailConfirmed: user.email_confirmed_at != null,
  };
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * D11: the five fields, and nothing else. The names, phone and language travel
 * as user metadata, which `handle_new_user` reads to write the profiles row.
 * Creating the account and creating the profile is one database transaction,
 * so an account can never exist without a role.
 */
export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
        preferred_locale: i18n.language === 'en' ? 'en' : 'ar',
      },
    },
  });

  if (error) throw error;

  // A project configured to hide which addresses exist answers a duplicate
  // sign-up with a user carrying no identities rather than an error. 14.2 owes
  // the player a straight answer and a way to sign in, so both shapes become
  // the same error.
  if (data.user !== null && (data.user.identities?.length ?? 0) === 0) {
    throw new EmailInUseError();
  }

  return { email: input.email, needsConfirmation: data.session === null };
}

export async function signIn(input: SignInInput): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword(input);
  if (error) throw error;
  return data.session;
}

/**
 * 14.3: the resend, behind the screen's 60 second cooldown.
 */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
}

/**
 * 14.3: confirming with the six digit code the email carries.
 *
 * `supabase/templates/confirm.html` renders `{{ .Token }}`, so the player has
 * a code to type rather than only a link to tap. This exchanges it for a
 * session directly — `onAuthStateChange` fires inside AuthProvider and
 * RootNavigator swaps the auth stack for the player tabs, exactly as following
 * the link does.
 */
export async function verifyEmailCode(input: VerifyEmailCodeInput): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: input.email,
    token: input.code,
    type: 'signup',
  });
  if (error) throw error;
  // GoTrue answers a valid exchange with a session. There is no shape where it
  // succeeds without one, but the type is nullable, so this is the honest read
  // rather than a non-null assertion.
  if (data.session === null) throw new InvalidCodeError();
  return data.session;
}

/**
 * 14.3 polling. There is no session to poll — GoTrue withholds one until the
 * link is followed — so the sign-in itself is the probe. It fails with
 * `email_not_confirmed` until the player taps the link and succeeds the moment
 * he has, which is exactly the "advances automatically" the screen promises.
 *
 * Returns the session on confirmation, null while still waiting. Anything that
 * is not "not yet confirmed" is rethrown, so a deleted or changed account stops
 * the loop instead of spinning on it.
 */
export async function pollForConfirmation(input: SignInInput): Promise<Session | null> {
  try {
    return await signIn(input);
  } catch (error) {
    if (toAppAuthError(error).code === 'email_not_confirmed') return null;
    throw error;
  }
}

/**
 * 14.5. Always reports success, whether or not the address is known, so that
 * nobody can use this form to find out who has an account. A rate limit or a
 * dead connection is a different thing and is reported.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  // Section 24 question 8: without a hosted landing page, the redirect has
  // nowhere to go, so the option is passed only once one exists. Until then
  // this call behaves exactly as it always has — Supabase's own fallback to
  // `site_url` — rather than pointing at a page that does not exist yet.
  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    config.passwordResetUrl === '' ? undefined : { redirectTo: config.passwordResetUrl },
  );
  if (error === null) return;

  const { code } = toAppAuthError(error);
  if (code === 'too_many_requests' || code === 'network') throw error;
}

/**
 * Sign out. The scope is local on purpose: signing out on this phone should
 * not end a session the player has on another device.
 *
 * The explicit key wipe afterwards is the phase 2 requirement that sign out
 * clears everything — `signOut()` removes the session it knows about, and this
 * removes every chunk under that key whether it knew about them or not.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  await clearSecureKey(AUTH_STORAGE_KEY);
  if (error) throw error;
}

/**
 * 14.14 step 5. The edge function reads the caller's identity from the token
 * this request carries, so there is nothing to send it.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  // The account is gone; the tokens on this phone are the last trace of it.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  await clearSecureKey(AUTH_STORAGE_KEY);
}
