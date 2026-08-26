/**
 * Payment, review and balance queries. Every Supabase read passes through
 * here. CLAUDE.md.
 */
import { useTranslation } from 'react-i18next';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Locale } from '@/lib/money';

import {
  fetchMoneySummary,
  fetchPlayerBalance,
  fetchPlayerIdentity,
  fetchPlayerRecentSessions,
  fetchProofUrl,
  fetchSessionReview,
  fetchSessionsMoneySummary,
} from './api';
import type {
  MoneySummary,
  PlayerBalance,
  PlayerIdentity,
  PlayerRecentSession,
  ReviewRow,
  SessionMoneyGlance,
} from './types';

export const paymentKeys = {
  all: ['payments'] as const,
  review: (sessionId: string) => ['payments', 'review', sessionId] as const,
  summary: (sessionId: string) => ['payments', 'summary', sessionId] as const,
  summaryBatch: (sessionIds: readonly string[]) =>
    ['payments', 'summaryBatch', [...sessionIds].sort()] as const,
  proof: (storagePath: string) => ['payments', 'proof', storagePath] as const,
  balance: (playerId: string, locale: Locale) => ['payments', 'balance', playerId, locale] as const,
  identity: (playerId: string) => ['payments', 'identity', playerId] as const,
  recentSessions: (playerId: string, locale: Locale) =>
    ['payments', 'recentSessions', playerId, locale] as const,
};

function useLocale(): Locale {
  const { i18n } = useTranslation();
  return i18n.language === 'ar' ? 'ar' : 'en';
}

/** 10.2's rows. Staff only, and RLS is what makes that true. */
export function useSessionReview(sessionId: string): UseQueryResult<ReviewRow[], Error> {
  return useQuery({
    queryKey: paymentKeys.review(sessionId),
    queryFn: () => fetchSessionReview(sessionId),
  });
}

/**
 * 10.2's footer. Separate from the rows because it carries the two numbers the
 * client cannot compute — the session's cost snapshot (12.1) and the value of
 * a credit at its subscription's rate (12.2 rule 1) — and because a failure to
 * read it should cost the coach his cost line, not his whole review screen.
 */
export function useMoneySummary(sessionId: string): UseQueryResult<MoneySummary, Error> {
  return useQuery({
    queryKey: paymentKeys.summary(sessionId),
    queryFn: () => fetchMoneySummary(sessionId),
  });
}

/**
 * 15.1's card footer, batched across the whole Today list. `sessionIds` is
 * sorted before it reaches the key, so a re-render with the same set in a
 * different order does not refetch — `useTodaySessions`'s own array is fresh
 * every render.
 *
 * `isEnabled` gates the whole query rather than filtering the array down to
 * past sessions first: the caller (TodayScreen) already knows which cards
 * want a summary at all, and an empty list is nothing to ask the server for.
 */
export function useSessionsMoneySummary(
  sessionIds: readonly string[],
  isEnabled: boolean,
): UseQueryResult<Map<string, SessionMoneyGlance>, Error> {
  return useQuery({
    queryKey: paymentKeys.summaryBatch(sessionIds),
    queryFn: () => fetchSessionsMoneySummary(sessionIds),
    enabled: isEnabled && sessionIds.length > 0,
  });
}

/**
 * A signed URL for one proof. 10.2's *View proof*.
 *
 * The URL lives five minutes (api.ts), so it is refetched rather than kept:
 * `staleTime` is well inside that, and the query is only enabled while the
 * viewer is actually open.
 */
export function useProofUrl(
  storagePath: string | null,
  isEnabled: boolean,
): UseQueryResult<string, Error> {
  return useQuery({
    queryKey: paymentKeys.proof(storagePath ?? ''),
    queryFn: async () => {
      if (storagePath === null) throw new Error('proof_required');
      return fetchProofUrl(storagePath);
    },
    enabled: isEnabled && storagePath !== null,
    staleTime: 4 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

/** 15.8 section 6 and 10.3. */
export function usePlayerBalance(playerId: string): UseQueryResult<PlayerBalance, Error> {
  const locale = useLocale();

  return useQuery({
    queryKey: paymentKeys.balance(playerId, locale),
    queryFn: () => fetchPlayerBalance(playerId, locale),
  });
}

/** 15.8 section 1. */
export function usePlayerIdentity(playerId: string): UseQueryResult<PlayerIdentity, Error> {
  return useQuery({
    queryKey: paymentKeys.identity(playerId),
    queryFn: () => fetchPlayerIdentity(playerId),
  });
}

/** 15.8 section 7: "Last 20 bookings with payment outcomes." */
export function usePlayerRecentSessions(
  playerId: string,
): UseQueryResult<PlayerRecentSession[], Error> {
  const locale = useLocale();

  return useQuery({
    queryKey: paymentKeys.recentSessions(playerId, locale),
    queryFn: () => fetchPlayerRecentSessions(playerId, locale),
  });
}
