/**
 * The three staff session mutations. 15.4, 15.5 and 15.6.
 *
 * Each one invalidates the whole `sessions` key rather than patching a cache
 * entry, because all three change more than the row they touch: a cancellation
 * redivides the night's court cost across every surviving session (12.1), and
 * a new one-off does the same in the other direction. A surgical update would
 * leave the sibling sessions showing yesterday's cost share.
 *
 * 17.4 asks for optimistic feedback "where safe". None of these is: the
 * capacity guard, the lock check and the 5.5 status rules all live on the
 * server, so an optimistic edit would show a save that the server is about to
 * refuse.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { lineupKeys } from '@/features/matchmaking/queries';

import {
  addRotation,
  cancelSession,
  createOneOffSession,
  removeRotation,
  updateSession,
} from './api';
import { sessionKeys } from './queries';
import type { CancelSessionInput, CreateSessionInput, UpdateSessionInput } from './types';

export function useUpdateSession(): UseMutationResult<void, Error, UpdateSessionInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSessionInput) => updateSession(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

export function useCreateOneOffSession(): UseMutationResult<string, Error, CreateSessionInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSessionInput) => createOneOffSession(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

/**
 * D62/A15. Returns the new rotation_count; the court board regenerates the
 * lineup from it rather than this hook touching the lineup cache.
 */
export function useAddRotation(): UseMutationResult<number, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => addRotation(sessionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });
}

export interface RemoveRotationInput {
  sessionId: string;
  /** 1-based, as the chips are numbered. */
  rotationIndex: number;
}

/**
 * Deletes one round. Migration 0042.
 *
 * Both caches are invalidated, not just the session's: the rounds above the
 * deleted one have been renumbered, so the stored lineup on this phone is
 * stale in a way no local edit can reproduce.
 */
export function useRemoveRotation(): UseMutationResult<number, Error, RemoveRotationInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RemoveRotationInput) =>
      removeRotation(input.sessionId, input.rotationIndex),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      void queryClient.invalidateQueries({ queryKey: lineupKeys.all });
    },
  });
}

/**
 * 9.4. Sends no push notification — D31 — and the absence is the feature. The
 * announcement prompt that follows is the screen's job, not this hook's.
 */
export function useCancelSession(): UseMutationResult<void, Error, CancelSessionInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CancelSessionInput) => cancelSession(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
