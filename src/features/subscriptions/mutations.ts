/**
 * Subscription mutations. BUILD-SPEC 11.2, 11.3, 11.5, 15.9, 15.10.
 *
 * ── Why none of these is optimistic ───────────────────────
 * 17.4 asks for optimistic feedback "where safe". A credit ledger is not a
 * safe place for it, for the reason `features/payments/mutations.ts` gives
 * about money: the balance the coach reads back is the sum of rows the server
 * decided to write, and showing him 27 before the server has agreed to 27
 * would make the one number this phase exists to get right a guess. The
 * mutations are one round trip and the screens wait.
 *
 * ── What each one invalidates ─────────────────────────────
 * Every write here changes a balance, and a balance is read in four places: the
 * subscriptions screen, the profile credits card, the booking sheet's credit
 * option, and 15.2's add-player search results. They all hang off
 * `creditKeys.all`, so all four go. The player directory carries a credits
 * column too, which is why `playerKeys` goes with them.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { playerKeys } from '@/features/players/queries';

import { adjustCredits, extendSubscription, grantSubscription } from './api';
import { creditKeys } from './queries';
import type { AdjustCreditsInput, ExtendSubscriptionInput, GrantSubscriptionInput } from './types';

function useInvalidateCredits(): () => void {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: creditKeys.all });
    void queryClient.invalidateQueries({ queryKey: playerKeys.all });
  };
}

/** 15.9. Resolves to the new subscription's id, which 15.10 can then adjust. */
export function useGrantSubscription(): UseMutationResult<string, Error, GrantSubscriptionInput> {
  const invalidate = useInvalidateCredits();

  return useMutation({
    mutationFn: (input: GrantSubscriptionInput) => grantSubscription(input),
    onSuccess: invalidate,
  });
}

/**
 * 11.5 and D55. Coach only, and the server refuses an expired subscription
 * with `subscription_expired` — so an extension that fails has to re-read,
 * because the reason it failed is that the subscription is no longer what the
 * screen thinks it is.
 */
export function useExtendSubscription(): UseMutationResult<void, Error, ExtendSubscriptionInput> {
  const invalidate = useInvalidateCredits();

  return useMutation({
    mutationFn: (input: ExtendSubscriptionInput) => extendSubscription(input),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

/** 15.10, and the second half of 11.3's migration flow. */
export function useAdjustCredits(): UseMutationResult<void, Error, AdjustCreditsInput> {
  const invalidate = useInvalidateCredits();

  return useMutation({
    mutationFn: (input: AdjustCreditsInput) => adjustCredits(input),
    onSuccess: invalidate,
  });
}
