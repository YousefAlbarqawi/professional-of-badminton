/**
 * Auth domain types. BUILD-SPEC 14.2 to 14.5 and D10 to D13.
 */
import type { Database } from '@/types/database';

/** The four roles in D16, D17 and 14.0. */
export type Role = Database['public']['Enums']['user_role'];

/** D10: email and password only. No OAuth, no magic links, no phone auth. */
export interface SignUpInput {
  /** D11: exactly these five fields, all required. */
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

/** What the app knows about who is signed in, before the profile loads. */
export interface AuthUser {
  id: string;
  email: string;
  isEmailConfirmed: boolean;
}

/**
 * The result of a sign-up. D12 and 14.3: the account exists and a confirmation
 * link has been sent, but there is no session until the player follows it.
 */
export interface SignUpResult {
  email: string;
  needsConfirmation: boolean;
}

/** Where RootNavigator sends the player. */
export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';
