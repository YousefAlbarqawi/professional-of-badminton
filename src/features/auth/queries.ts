/**
 * Auth queries.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';

import { pollForConfirmation } from './api';
import type { PendingVerification } from './pendingVerification';

/** 14.3: "polls ... every 5 seconds while foregrounded". */
export const CONFIRMATION_POLL_MS = 5_000;

export const authKeys = {
  confirmation: (email: string) => ['auth', 'confirmation', email] as const,
};

/**
 * Watches for the player following the confirmation link.
 *
 * Resolves to a session the moment he has, at which point `onAuthStateChange`
 * fires inside AuthProvider and RootNavigator swaps the auth stack for the
 * player tabs. The screen does not have to navigate anywhere itself.
 *
 * `refetchIntervalInBackground` stays false and the focus manager is wired to
 * AppState in `lib/queryClient`, so a backgrounded app stops asking.
 */
export function useEmailConfirmationPoll(
  pending: PendingVerification | null,
): UseQueryResult<Session | null, Error> {
  return useQuery({
    queryKey: authKeys.confirmation(pending?.email ?? ''),
    queryFn: async () => {
      if (pending === null) return null;
      return pollForConfirmation(pending);
    },
    enabled: pending !== null,
    refetchInterval: CONFIRMATION_POLL_MS,
    refetchIntervalInBackground: false,
    // A failure here is a real one — a wrong password, a deleted account. It
    // should surface, not be retried into a loop.
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
}
