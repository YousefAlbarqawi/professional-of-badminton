/**
 * Auth mutations. Screens call these; they never call `api.ts` directly and
 * never touch `supabase`. CLAUDE.md.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';

import {
  deleteAccount,
  requestPasswordReset,
  resendConfirmation,
  signIn,
  signUp,
  verifyEmailCode,
} from './api';
import type { SignInInput, SignUpInput, SignUpResult, VerifyEmailCodeInput } from './types';

export function useSignUp(): UseMutationResult<SignUpResult, Error, SignUpInput> {
  return useMutation({ mutationFn: signUp });
}

export function useSignIn(): UseMutationResult<Session, Error, SignInInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signIn,
    // A new person on this phone must not read the last one's cached profile.
    onSuccess: () => queryClient.clear(),
  });
}

/**
 * 14.3. Succeeding here puts a session in place, which is the same thing
 * signing in does — so it clears the cache for the same reason `useSignIn`
 * does, rather than letting a new player inherit the last one's data.
 */
export function useVerifyEmailCode(): UseMutationResult<Session, Error, VerifyEmailCodeInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyEmailCode,
    onSuccess: () => queryClient.clear(),
  });
}

export function useResendConfirmation(): UseMutationResult<void, Error, string> {
  return useMutation({ mutationFn: resendConfirmation });
}

export function useRequestPasswordReset(): UseMutationResult<void, Error, string> {
  return useMutation({ mutationFn: requestPasswordReset });
}

export function useDeleteAccount(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => queryClient.clear(),
  });
}
