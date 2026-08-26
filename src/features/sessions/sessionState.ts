/**
 * The session detail primary action, and the schedule's day grouping.
 *
 * Pure functions, no React, no network. BUILD-SPEC 19.1 asks for a component
 * test proving "the primary action button matches the state table in Section
 * 14.7 for all eight states", which only means anything if the eight states
 * are named somewhere and are total.
 *
 * ── The eight states ──────────────────────────────────────
 * 14.7's table has seven rows; 19.1 says eight. The missing one is `ended`: a
 * session that is over. It is unreachable from the player schedule, which
 * hides finished sessions (5.2), but it is reachable from My Bookings, which
 * 14.9 keeps showing for 30 days, and 14.10 says the cancel button there is
 * "subject to the window". Without it the enumeration is not total and a
 * finished session would offer *Cancel my reservation*.
 *
 * ── Why the order below ───────────────────────────────────
 * The seven rows of 14.7 overlap, so they need a precedence rather than a
 * lookup. Reading them as written:
 *
 *   cancelled           beats everything. "No actions except WhatsApp."
 *   ended               a session that is over offers nothing either.
 *   booked_*            his own reservation is the thing he came to see.
 *   closed              row 6 says "after the 1 hour cutoff, **not booked**",
 *                       and a player sitting on a waiting list is not booked.
 *                       D28 agrees: a spot opening inside the last hour is
 *                       invisible to the list, so *Leave the waiting list*
 *                       after the cutoff would be offering him control over
 *                       something that can no longer happen. 9.5 clears the
 *                       entries when the session starts.
 *   on_waitlist         row 3.
 *   full / open         rows 2 and 1.
 */
import { ammanDayKey, ammanStartOfDay, isWithinCancellationWindow } from '@/lib/time';

import type { SessionDay, SessionStatus } from './types';

export type SessionActionState =
  /** 14.7: red banner, no actions except WhatsApp. */
  | 'cancelled'
  /** The session is over. See the note above. */
  | 'ended'
  /** Booked, more than 3 hours out: *Cancel my reservation*, secondary. */
  | 'booked_cancellable'
  /** Booked, less than 3 hours out: disabled, plus WhatsApp. D24. */
  | 'booked_locked'
  /** Not booked, past the 1 hour cutoff: disabled *Booking closed*. D21. */
  | 'closed'
  /** On the waiting list: *Leave the waiting list*, plus the explainer. */
  | 'on_waitlist'
  /** Not booked, no spots left, before the cutoff: *Join the waiting list*. */
  | 'full'
  /** Not booked, spots left, before the cutoff: *Reserve a spot*. */
  | 'open';

export interface SessionActionInput {
  status: SessionStatus;
  startsAt: Date;
  endsAt: Date;
  /** From `v_session_occupancy`. */
  remaining: number;
  isBooked: boolean;
  isOnWaitlist: boolean;
  /** Always passed in, never read from the clock here, so tests can pin it. */
  now: Date;
}

/** Statuses that mean the session has already happened. 5.5. */
const FINISHED_STATUSES: readonly SessionStatus[] = ['pending_review', 'confirmed', 'locked'];

/** D21: reservations close one hour before start. */
const RESERVATION_CUTOFF_MS = 60 * 60 * 1000;

export function isPastReservationCutoff(startsAt: Date, now: Date): boolean {
  return now.getTime() >= startsAt.getTime() - RESERVATION_CUTOFF_MS;
}

export function sessionActionState(input: SessionActionInput): SessionActionState {
  const { status, startsAt, endsAt, remaining, isBooked, isOnWaitlist, now } = input;

  if (status === 'cancelled') return 'cancelled';

  if (FINISHED_STATUSES.includes(status) || endsAt.getTime() <= now.getTime()) {
    return 'ended';
  }

  if (isBooked) {
    // D23 and D24: he may cancel until three hours before start, and not a
    // minute after. The server checks the same boundary again.
    return isWithinCancellationWindow(startsAt, now) ? 'booked_cancellable' : 'booked_locked';
  }

  if (isPastReservationCutoff(startsAt, now)) return 'closed';
  if (isOnWaitlist) return 'on_waitlist';
  if (remaining <= 0) return 'full';

  return 'open';
}

/** Every state, in the precedence order above. Exported so a test can be total. */
export const SESSION_ACTION_STATES: readonly SessionActionState[] = [
  'cancelled',
  'ended',
  'booked_cancellable',
  'booked_locked',
  'closed',
  'on_waitlist',
  'full',
  'open',
];

/**
 * Group sessions into Amman calendar days, preserving the order they arrive
 * in. Callers sort by `starts_at` in the query, which makes days ascending and
 * sessions inside a day ascending, exactly what 14.6 and 15.3 ask for.
 */
export function groupByAmmanDay<T extends { startsAt: Date }>(
  sessions: readonly T[],
): SessionDay<T>[] {
  const days: SessionDay<T>[] = [];
  const index = new Map<string, SessionDay<T>>();

  for (const session of sessions) {
    const dayKey = ammanDayKey(session.startsAt);
    let day = index.get(dayKey);

    if (day === undefined) {
      day = { dayKey, date: ammanStartOfDay(session.startsAt), sessions: [] };
      index.set(dayKey, day);
      days.push(day);
    }

    day.sessions.push(session);
  }

  return days;
}

/**
 * 5.2: "Sessions in the past are hidden from the player schedule entirely",
 * but "a Tuesday session that started at 13:00 would be past its cutoff and
 * shown as closed, not hidden". So the line is drawn at the end of the
 * session, not at its start and not at the booking cutoff.
 *
 * This is presentation, not protection. RLS is what stops a player reading a
 * session outside his window; this stops him reading last night's.
 */
export function isVisibleOnPlayerSchedule(
  session: { status: SessionStatus; endsAt: Date },
  now: Date,
): boolean {
  if (session.status === 'cancelled') return false;
  if (FINISHED_STATUSES.includes(session.status)) return false;
  return session.endsAt.getTime() > now.getTime();
}
