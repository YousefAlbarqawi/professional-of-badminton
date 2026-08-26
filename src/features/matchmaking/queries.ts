/**
 * Lineup reads. Every Supabase read goes through a hook here. CLAUDE.md.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchLineup, fetchPairingRules } from './api';
import type { PairingRuleSummary, StoredLineup } from './boardTypes';

export const lineupKeys = {
  all: ['lineup'] as const,
  session: (sessionId: string) => ['lineup', sessionId] as const,
  pairingRules: () => ['lineup', 'pairingRules'] as const,
};

/**
 * The saved lineup, or null when there is none yet.
 *
 * Null is not an error state and not an empty state either: 13.8 says a
 * booking change discards the lineup while `has_manual_lineup` is false, so
 * null is the ordinary condition of a board that needs generating. The screen
 * generates on the spot rather than showing the coach a button to press.
 */
export function useLineup(sessionId: string): UseQueryResult<StoredLineup | null, Error> {
  return useQuery({
    queryKey: lineupKeys.session(sessionId),
    queryFn: () => fetchLineup(sessionId),
  });
}

/** D65. Not scoped to a session: a rule is about two people, not one night. */
export function usePairingRules(): UseQueryResult<PairingRuleSummary[], Error> {
  return useQuery({
    queryKey: lineupKeys.pairingRules(),
    queryFn: () => fetchPairingRules(),
  });
}
