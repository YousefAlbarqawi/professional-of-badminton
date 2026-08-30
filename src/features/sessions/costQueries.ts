/**
 * Session cost reads and writes, as hooks. Every Supabase read goes through
 * one of these. CLAUDE.md.
 *
 * All three mutations invalidate the same two things: this session's costs,
 * and its money summary — because 10.2's footer prints profit, and profit is
 * revenue minus the number these writes just changed.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { paymentKeys } from '@/features/payments/queries';

import {
  addSessionExtraCost,
  deleteSessionExtraCost,
  fetchSessionCosts,
  setSessionCosts,
} from './costApi';
import type {
  AddSessionExtraCostInput,
  DeleteSessionExtraCostInput,
  SessionCosts,
  SetSessionCostsInput,
} from './costTypes';

export const sessionCostKeys = {
  all: ['sessionCosts'] as const,
  session: (sessionId: string) => ['sessionCosts', sessionId] as const,
};

/** One session's cost breakdown, with its extra lines. Staff only, by RLS. */
export function useSessionCosts(sessionId: string): UseQueryResult<SessionCosts, Error> {
  return useQuery({
    queryKey: sessionCostKeys.session(sessionId),
    queryFn: () => fetchSessionCosts(sessionId),
  });
}

function useCostInvalidation(): (sessionId: string) => void {
  const queryClient = useQueryClient();

  return (sessionId: string): void => {
    void queryClient.invalidateQueries({ queryKey: sessionCostKeys.session(sessionId) });
    void queryClient.invalidateQueries({ queryKey: paymentKeys.summary(sessionId) });
  };
}

export function useSetSessionCosts(): UseMutationResult<void, Error, SetSessionCostsInput> {
  const invalidate = useCostInvalidation();

  return useMutation({
    mutationFn: (input: SetSessionCostsInput) => setSessionCosts(input),
    onSuccess: (_result, input) => invalidate(input.sessionId),
  });
}

export function useAddSessionExtraCost(): UseMutationResult<
  string,
  Error,
  AddSessionExtraCostInput
> {
  const invalidate = useCostInvalidation();

  return useMutation({
    mutationFn: (input: AddSessionExtraCostInput) => addSessionExtraCost(input),
    onSuccess: (_result, input) => invalidate(input.sessionId),
  });
}

export function useDeleteSessionExtraCost(): UseMutationResult<
  void,
  Error,
  DeleteSessionExtraCostInput
> {
  const invalidate = useCostInvalidation();

  return useMutation({
    mutationFn: (input: DeleteSessionExtraCostInput) => deleteSessionExtraCost(input.id),
    onSuccess: (_result, input) => invalidate(input.sessionId),
  });
}
