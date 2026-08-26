/**
 * Lineup writes. 13.8 and 13.9.
 *
 * 17.4 asks for optimistic feedback "where safe". A swap is the one place in
 * this app where it is: the coach drags a tile across a court in front of
 * sixteen people and the tile has to land under his finger, not a round trip
 * later. So `useSwapPlayers` writes the cache first and rolls back visibly if
 * the server refuses — which it does when the court turns out to be locked.
 *
 * Nothing else here is optimistic. Locking a court and regenerating both
 * change what the *next* generation does, and neither is a gesture the coach
 * is watching a tile for.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import {
  deletePairingRule,
  saveLineup,
  setCourtLock,
  setPairingRule,
  swapLineupPlayers,
} from './api';
import { lineupKeys } from './queries';
import type {
  CourtLockInput,
  SetPairingRuleInput,
  StoredLineup,
  SwapPlayersInput,
} from './boardTypes';
import type { Court, Lineup } from './types';

export interface SaveLineupInput {
  sessionId: string;
  lineup: Lineup;
}

/**
 * Writes a generated lineup whole and clears `has_manual_lineup`, so a later
 * booking change may discard it again. 13.8.
 */
export function useSaveLineup(): UseMutationResult<void, Error, SaveLineupInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveLineupInput) => saveLineup(input.sessionId, input.lineup),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: lineupKeys.session(input.sessionId) });
    },
  });
}

/** Swap two booking ids wherever they sit in one rotation, courts or resting. */
function swapInRotation(courts: readonly Court[], a: string, b: string): Court[] {
  const swap = (id: string): string => (id === a ? b : id === b ? a : id);
  return courts.map((court) => ({
    courtNumber: court.courtNumber,
    team1: court.team1.map(swap),
    team2: court.team2.map(swap),
  }));
}

export function useSwapPlayers(): UseMutationResult<void, Error, SwapPlayersInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SwapPlayersInput) => swapLineupPlayers(input),

    onMutate: async (input) => {
      const key = lineupKeys.session(input.sessionId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<StoredLineup | null>(key);

      queryClient.setQueryData<StoredLineup | null>(key, (current) => {
        if (current == null) return current;
        return {
          ...current,
          // 13.8: the moment he swaps anything the flag is true, and the
          // banner it governs must appear at once rather than after a refetch.
          hasManualLineup: true,
          rotations: current.rotations.map((rotation) =>
            rotation.id === input.rotationId
              ? {
                  ...rotation,
                  courts: swapInRotation(rotation.courts, input.bookingIdA, input.bookingIdB),
                  sitOuts: rotation.sitOuts.map((id) =>
                    id === input.bookingIdA
                      ? input.bookingIdB
                      : id === input.bookingIdB
                        ? input.bookingIdA
                        : id,
                  ),
                }
              : rotation,
          ),
        };
      });

      return { previous };
    },

    // "Rolls back visibly on failure." 17.4.
    onError: (_error, input, context) => {
      const previous = (context as { previous?: StoredLineup | null } | undefined)?.previous;
      if (previous !== undefined) {
        queryClient.setQueryData(lineupKeys.session(input.sessionId), previous);
      }
    },

    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: lineupKeys.session(input.sessionId) });
    },
  });
}

export function useSetCourtLock(): UseMutationResult<void, Error, CourtLockInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CourtLockInput) => setCourtLock(input),
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: lineupKeys.session(input.sessionId) });
    },
  });
}

export function useSetPairingRule(): UseMutationResult<string, Error, SetPairingRuleInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SetPairingRuleInput) => setPairingRule(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lineupKeys.pairingRules() });
    },
  });
}

export function useDeletePairingRule(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ruleId: string) => deletePairingRule(ruleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lineupKeys.pairingRules() });
    },
  });
}
