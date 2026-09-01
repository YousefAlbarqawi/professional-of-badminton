/**
 * Payment, review and balance mutations. BUILD-SPEC 8.5, 10.1, 10.2, 10.3.
 *
 * ── Why none of these is optimistic ───────────────────────
 * 17.4 asks for optimistic feedback "where safe". Money is not a safe place
 * for it. `record_payment` decides the payment status from a comparison the
 * server makes and rewrites a balance entry as a side effect; showing a row as
 * paid and taking it back a moment later would leave the coach unsure what the
 * academy is actually owed, which is the one thing this screen exists to be
 * certain about. The mutations are fast and the rows are few.
 *
 * ── What each one invalidates ─────────────────────────────
 * A payment changes the review rows, the footer, and what that player owes.
 * The session's own status changes on confirm and reopen, so the session
 * caches go too. A refetch of a dozen rows is cheaper than a stale total.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { bookingKeys } from '@/features/bookings/queries';
import { playerKeys, profileKeys } from '@/features/players/queries';
import { sessionKeys } from '@/features/sessions/queries';
import type { Tier } from '@/lib/tiers';

import {
  addBalanceEntry,
  confirmSessionReview,
  createCliqBooking,
  deleteBalanceEntry,
  recordPayment,
  reopenSessionReview,
  setPlayerRate,
  setPlayerRole,
  setPlayerTier,
  setPlayerVisibility,
  type CliqBookingInput,
  type ManualBalanceInput,
  type SetPlayerRateInput,
} from './api';
import { paymentKeys } from './queries';
import type { PlayerIdentity, RecordPaymentInput } from './types';

function useInvalidateAfterPayment(): () => void {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: paymentKeys.all });
    void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
  };
}

/** 8.5, and 10.2's *Mark paid*, *Partial*, *Not paid* and *Change method*. */
export function useRecordPayment(): UseMutationResult<void, Error, RecordPaymentInput> {
  const invalidate = useInvalidateAfterPayment();

  return useMutation({
    mutationFn: (input: RecordPaymentInput) => recordPayment(input),
    onSuccess: invalidate,
    // A session that locked underneath him is a state the screen has to
    // re-read, not just a message. D39.
    onError: invalidate,
  });
}

/** 10.2's *Confirm session*. */
export function useConfirmReview(): UseMutationResult<void, Error, string> {
  const invalidate = useInvalidateAfterPayment();

  return useMutation({
    mutationFn: (sessionId: string) => confirmSessionReview(sessionId),
    onSuccess: invalidate,
  });
}

/** 8.5's reverse. Allowed until ends_at + 7 days. */
export function useReopenReview(): UseMutationResult<void, Error, string> {
  const invalidate = useInvalidateAfterPayment();

  return useMutation({
    mutationFn: (sessionId: string) => reopenSessionReview(sessionId),
    onSuccess: invalidate,
  });
}

/**
 * 10.1's whole CliQ flow: prepare, upload, create. One mutation because they
 * are one act from the player's side, and because a failure at any step must
 * leave him in the same place — the sheet, with a retry.
 */
export function useCreateCliqBooking(): UseMutationResult<string, Error, CliqBookingInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CliqBookingInput) => createCliqBooking(input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

/** 10.3's manual entry, positive for a debt and negative for a settlement. */
export function useAddBalanceEntry(): UseMutationResult<void, Error, ManualBalanceInput> {
  const invalidate = useInvalidateAfterPayment();

  return useMutation({
    mutationFn: (input: ManualBalanceInput) => addBalanceEntry(input),
    onSuccess: invalidate,
  });
}

export function useDeleteBalanceEntry(): UseMutationResult<void, Error, string> {
  const invalidate = useInvalidateAfterPayment();

  return useMutation({
    mutationFn: (entryId: string) => deleteBalanceEntry(entryId),
    onSuccess: invalidate,
  });
}

/**
 * 15.8 sections 2, 3, 4 and 8. All four invalidate the same three things: the
 * identity this screen reads, the directory row that shows tier and
 * visibility (15.7), and `profileKeys` for the rare case the admin is editing
 * his own row.
 */
function useInvalidateAfterProfileEdit(): () => void {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: paymentKeys.all });
    void queryClient.invalidateQueries({ queryKey: playerKeys.all });
    void queryClient.invalidateQueries({ queryKey: profileKeys.all });
  };
}

export interface SetPlayerTierInput {
  playerId: string;
  tier: Tier | null;
}

/** 15.8 section 2, and 15.2's *Change tier* row action. */
export function useSetPlayerTier(): UseMutationResult<void, Error, SetPlayerTierInput> {
  const invalidate = useInvalidateAfterProfileEdit();

  return useMutation({
    mutationFn: (input: SetPlayerTierInput) => setPlayerTier(input.playerId, input.tier),
    onSuccess: invalidate,
  });
}

export interface SetPlayerVisibilityInput {
  playerId: string;
  visibility: PlayerIdentity['visibility'];
}

/** 15.8 section 3. */
export function useSetPlayerVisibility(): UseMutationResult<void, Error, SetPlayerVisibilityInput> {
  const invalidate = useInvalidateAfterProfileEdit();

  return useMutation({
    mutationFn: (input: SetPlayerVisibilityInput) =>
      setPlayerVisibility(input.playerId, input.visibility),
    onSuccess: invalidate,
  });
}

/** 15.8 section 4. Either field null resets to the session's list price. D41. */
export function useSetPlayerRate(): UseMutationResult<void, Error, SetPlayerRateInput> {
  const invalidate = useInvalidateAfterProfileEdit();

  return useMutation({
    mutationFn: (input: SetPlayerRateInput) => setPlayerRate(input),
    onSuccess: invalidate,
  });
}

export interface SetPlayerRoleInput {
  playerId: string;
  role: PlayerIdentity['role'];
}

/** 15.8 section 8. D16: the server refuses promoting to coach unless the caller already is one. */
export function useSetPlayerRole(): UseMutationResult<void, Error, SetPlayerRoleInput> {
  const invalidate = useInvalidateAfterProfileEdit();

  return useMutation({
    mutationFn: (input: SetPlayerRoleInput) => setPlayerRole(input.playerId, input.role),
    onSuccess: invalidate,
  });
}
