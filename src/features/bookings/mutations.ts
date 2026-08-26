/**
 * Booking mutations. 8.2, 8.3, 9.5, 15.2.
 *
 * ── Why none of these is optimistic ───────────────────────
 * 17.4 asks for optimistic feedback "where safe". Booking is the least safe
 * mutation in the app: whether it succeeds depends on a count taken under a
 * lock on the server (5.4), and the whole point of 14.8's *"Sorry, the last
 * spot went while you were booking"* is that the client cannot know. Showing a
 * spot as taken and then taking it back would be worse than a spinner.
 *
 * ── What each one invalidates ─────────────────────────────
 * A booking changes three things a screen might be showing: the occupancy on
 * the session (`sessions`), whether this player has a spot (`bookings`), and,
 * when a credit moved, what he has left (`credits`). Rather than patch three
 * caches by hand, each mutation invalidates the keys it touched. At this scale
 * — a dozen sessions, one player's own rows — a refetch is cheaper than a bug.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { drainPushQueue } from '@/features/notifications/api';
import { creditKeys } from '@/features/subscriptions/queries';
import { sessionKeys } from '@/features/sessions/queries';

import {
  adminAddCoach,
  adminAddGuest,
  adminAddPlayer,
  adminMoveBooking,
  adminRemoveBooking,
  cancelOwnBooking,
  createBooking,
  joinWaitlist,
  leaveWaitlist,
} from './api';
import { bookingKeys } from './queries';
import type {
  AddCoachInput,
  AddGuestInput,
  AddPlayerInput,
  CreateBookingInput,
  MoveBookingInput,
  RemoveBookingInput,
} from './types';

/** Everything a booking change can invalidate, in one place. */
function useInvalidateAfterBooking(): () => void {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return () => {
    void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    if (user !== null) {
      void queryClient.invalidateQueries({ queryKey: creditKeys.mine(user.id) });
    }
  };
}

/** 8.2. Returns the new booking's id. */
export function useCreateBooking(): UseMutationResult<string, Error, CreateBookingInput> {
  const invalidate = useInvalidateAfterBooking();

  return useMutation({
    mutationFn: (input: CreateBookingInput) => createBooking(input),
    onSuccess: invalidate,
    // A losing race is an expected outcome here, not a fault. The sheet reads
    // the code and shows 14.8's *Join the waiting list* instead.
    onError: invalidate,
  });
}

/**
 * 8.3 and D23.
 *
 * Step 7 of 8.3 calls `notify_waitlist`, which — since phase 8 — enqueues a
 * push job when a spot has genuinely opened more than an hour before the start
 * (D28). The nudge below asks the sender to drain it now rather than at the
 * next scheduled run, because D27 makes the waiting list a race and a
 * notification that arrives ten minutes late is a notification about a spot
 * somebody else has taken.
 *
 * It carries no audience and no message and cannot cause a push the database
 * did not already decide on — see `features/notifications/api.ts`. When the
 * spot opened inside the last hour there is no job, so this does nothing,
 * which is exactly D28.
 */
export function useCancelBooking(): UseMutationResult<void, Error, string> {
  const invalidate = useInvalidateAfterBooking();

  return useMutation({
    mutationFn: (bookingId: string) => cancelOwnBooking(bookingId),
    onSuccess: () => {
      invalidate();
      void drainPushQueue();
    },
  });
}

export function useJoinWaitlist(): UseMutationResult<void, Error, string> {
  const invalidate = useInvalidateAfterBooking();

  return useMutation({
    mutationFn: (sessionId: string) => joinWaitlist(sessionId),
    onSuccess: invalidate,
  });
}

export function useLeaveWaitlist(): UseMutationResult<void, Error, string> {
  const invalidate = useInvalidateAfterBooking();

  return useMutation({
    mutationFn: (sessionId: string) => leaveWaitlist(sessionId),
    onSuccess: invalidate,
  });
}

/** 15.2 and D43. */
export function useAddPlayer(): UseMutationResult<string, Error, AddPlayerInput> {
  const invalidate = useInvalidateAfterBooking();

  return useMutation({
    mutationFn: (input: AddPlayerInput) => adminAddPlayer(input),
    onSuccess: invalidate,
  });
}

/** 15.2, D44 and D45. */
export function useAddGuest(): UseMutationResult<string, Error, AddGuestInput> {
  const invalidate = useInvalidateAfterBooking();

  return useMutation({
    mutationFn: (input: AddGuestInput) => adminAddGuest(input),
    onSuccess: invalidate,
  });
}

/** 15.2, D17 and D47. */
export function useAddCoach(): UseMutationResult<string, Error, AddCoachInput> {
  const invalidate = useInvalidateAfterBooking();

  return useMutation({
    mutationFn: (input: AddCoachInput) => adminAddCoach(input),
    onSuccess: invalidate,
  });
}

/** 8.3 and 15.2's remove, with the credit return prompt behind it. */
export function useRemoveBooking(): UseMutationResult<void, Error, RemoveBookingInput> {
  const invalidate = useInvalidateAfterBooking();

  // `admin_remove_booking` calls `notify_waitlist` too, so the same nudge
  // applies for the same reason. See `useCancelBooking`.
  return useMutation({
    mutationFn: (input: RemoveBookingInput) => adminRemoveBooking(input),
    onSuccess: () => {
      invalidate();
      void drainPushQueue();
    },
  });
}

/**
 * 15.2's "Move to another session". Returns the new booking's id.
 *
 * `admin_move_booking` calls `notify_waitlist` on the session he left, for the
 * same reason `useRemoveBooking` does — a spot just opened there.
 */
export function useMoveBooking(): UseMutationResult<string, Error, MoveBookingInput> {
  const invalidate = useInvalidateAfterBooking();

  return useMutation({
    mutationFn: (input: MoveBookingInput) => adminMoveBooking(input),
    onSuccess: () => {
      invalidate();
      void drainPushQueue();
    },
  });
}
