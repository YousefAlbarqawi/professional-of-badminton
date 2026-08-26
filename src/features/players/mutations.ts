/**
 * Profile mutations.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type { Locale } from '@/lib/money';

import { updatePreferredLocale } from './api';
import { profileKeys } from './queries';

/**
 * 16.1: language is stored on the profile and mirrored to device storage. The
 * device copy is what survives before login and is written by
 * `useChangeLanguage`; this is the copy that follows the player to a new phone.
 *
 * A failure here is silent on purpose. The language has already changed in
 * front of him; telling him that a preference did not sync would be noise about
 * something he cannot act on, and the next change tries again.
 */
export function useUpdatePreferredLocale(): UseMutationResult<void, Error, Locale> {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (locale: Locale) => {
      if (user === null) throw new Error('not_authenticated');
      await updatePreferredLocale(user.id, locale);
    },
    onSuccess: () => {
      if (user === null) return;
      void queryClient.invalidateQueries({ queryKey: profileKeys.me(user.id) });
    },
  });
}
