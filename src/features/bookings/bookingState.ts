/**
 * The rules My Bookings and booking detail are drawn from. Pure functions, no
 * React, no network.
 *
 * Both rules here are the client's copy of something the server decides:
 * D23's three hour boundary is enforced again in `cancel_own_booking`, and
 * 5.2's thirty days is a presentation rule with no server side at all. The
 * copy exists so the screen can show the right button without a round trip,
 * and BUILD-SPEC 9 is explicit that this is all a client check is for.
 */
import { isWithinCancellationWindow } from '@/lib/time';

import type { BookingSegments, MyBooking } from './types';

/** 14.9 and 5.2: "past bookings for 30 days, then hides them". */
export const PAST_BOOKING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the player may still cancel this booking himself.
 *
 * Three things have to hold, and the second is easy to forget: a session that
 * has already ended is not cancellable however far it is from `starts_at - 3h`
 * in the wrong direction. `isWithinCancellationWindow` compares against the
 * start, so a session that finished last night would pass it on its own.
 */
export function canCancel(booking: MyBooking, now: Date): boolean {
  if (booking.status !== 'confirmed') return false;
  if (booking.session.status === 'cancelled') return false;
  if (booking.session.endsAt.getTime() <= now.getTime()) return false;

  return isWithinCancellationWindow(booking.session.startsAt, now);
}

/**
 * D24: inside the last three hours only the coach can remove him, and 9.2 says
 * the UI replaces the cancel button with a WhatsApp button. This is the state
 * that copy belongs to — booked, still to come, and too late to cancel here.
 */
export function isCancellationTooLate(booking: MyBooking, now: Date): boolean {
  if (booking.status !== 'confirmed') return false;
  if (booking.session.status === 'cancelled') return false;
  if (booking.session.endsAt.getTime() <= now.getTime()) return false;

  return !isWithinCancellationWindow(booking.session.startsAt, now);
}

/**
 * 14.9's two segments.
 *
 * Upcoming is everything that has not finished yet, including a session the
 * coach has cancelled — 14.7 has a red banner for exactly that and the player
 * needs somewhere to see it. Past is the last 30 days and nothing older.
 *
 * A cancelled *booking* is a different matter: he cancelled it, so it is not
 * his reservation any more and it appears in neither list.
 */
export function splitBookings(bookings: readonly MyBooking[], now: Date): BookingSegments {
  const upcoming: MyBooking[] = [];
  const past: MyBooking[] = [];
  const cutoff = now.getTime() - PAST_BOOKING_DAYS * DAY_MS;

  for (const booking of bookings) {
    if (booking.status === 'cancelled_by_player' || booking.status === 'cancelled_by_admin') {
      continue;
    }

    const ended = booking.session.endsAt.getTime() <= now.getTime();

    if (!ended) {
      upcoming.push(booking);
    } else if (booking.session.endsAt.getTime() >= cutoff) {
      past.push(booking);
    }
  }

  // Soonest first among what is coming, most recent first among what is gone.
  upcoming.sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime());
  past.sort((a, b) => b.session.startsAt.getTime() - a.session.startsAt.getTime());

  return { upcoming, past };
}
