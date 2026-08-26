/**
 * Credit and subscription queries. Every Supabase read passes through here.
 * CLAUDE.md.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { ammanDayKey, nowInAmman } from '@/lib/time';

import { fetchMyCredits, fetchPackages, fetchPlayerSubscriptions } from './api';
import type { CreditSummary, Package, Subscription } from './types';

export const creditKeys = {
  all: ['credits'] as const,
  mine: (playerId: string) => ['credits', 'mine', playerId] as const,
  subscriptions: (playerId: string) => ['credits', 'subscriptions', playerId] as const,
  packages: ['credits', 'packages'] as const,
};

/**
 * What the player has to spend. 14.8, and 14.12's credits card.
 *
 * The cutoff day is Amman's today, not the device's: A31 records why those are
 * not the same thing for three hours every night, and a credit that expires
 * today should be spendable all of today.
 */
export function useMyCredits(): UseQueryResult<CreditSummary, Error> {
  const { user } = useAuth();
  const playerId = user?.id;

  return useQuery({
    queryKey: playerId === undefined ? creditKeys.all : creditKeys.mine(playerId),
    queryFn: async () => {
      if (playerId === undefined) throw new Error('not_authenticated');
      return fetchMyCredits(playerId, ammanDayKey(nowInAmman()));
    },
    enabled: playerId !== undefined,
  });
}

/**
 * Every subscription one player holds, with its ledger. 14.13 and 15.8
 * section 5.
 *
 * The same hook serves the player looking at his own and the coach looking at
 * somebody else's, because RLS is the only thing that differs between the two
 * and it is applied underneath. A player passing another player's id gets an
 * empty list, not an error — which is what a row policy does.
 */
export function usePlayerSubscriptions(
  playerId: string | undefined,
): UseQueryResult<Subscription[], Error> {
  return useQuery({
    queryKey: playerId === undefined ? creditKeys.all : creditKeys.subscriptions(playerId),
    queryFn: async () => {
      if (playerId === undefined) throw new Error('not_authenticated');
      return fetchPlayerSubscriptions(playerId);
    },
    enabled: playerId !== undefined,
  });
}

/** The signed-in player's own. 14.13. */
export function useMySubscriptions(): UseQueryResult<Subscription[], Error> {
  const { user } = useAuth();
  return usePlayerSubscriptions(user?.id);
}

/**
 * D48's five packages, for 15.9's picker.
 *
 * They change roughly never, so this is cached for the session. A package
 * whose price the coach edits in the dashboard reaches the picker on the next
 * cold start, which is soon enough for a decision that is made in person.
 */
export function usePackages(): UseQueryResult<Package[], Error> {
  return useQuery({
    queryKey: creditKeys.packages,
    queryFn: fetchPackages,
    staleTime: 60 * 60 * 1000,
  });
}
