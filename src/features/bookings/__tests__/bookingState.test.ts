/**
 * The rules My Bookings and booking detail draw from. BUILD-SPEC 14.9, 14.10,
 * D23, D24, 5.2.
 *
 * The three hour boundary is tested here at 2h59m and 3h01m, exactly as 19.1
 * asks — and again against the real server in supabase/tests/cancelBooking.
 * The server is the authority (5.1); this copy decides which button he sees,
 * and the two must agree or the button will lie.
 */
import { canCancel, isCancellationTooLate, splitBookings } from '../bookingState';
import type { MyBooking } from '../types';
import type { Fils } from '@/lib/money';

const NOW = new Date('2026-08-20T12:00:00Z');
const MINUTE = 60 * 1000;

function booking(overrides: {
  id?: string;
  startsInMinutes: number;
  durationMinutes?: number;
  status?: MyBooking['status'];
  sessionStatus?: MyBooking['session']['status'];
}): MyBooking {
  const startsAt = new Date(NOW.getTime() + overrides.startsInMinutes * MINUTE);
  const endsAt = new Date(startsAt.getTime() + (overrides.durationMinutes ?? 90) * MINUTE);

  return {
    id: overrides.id ?? 'booking-1',
    status: overrides.status ?? 'confirmed',
    paymentMethod: 'cash',
    expectedFils: 6000 as Fils,
    bookedAt: new Date(NOW.getTime() - 24 * 60 * MINUTE),
    session: {
      id: 'session-1',
      venue: { id: 'venue-1', name: 'Khalda', area: 'Khalda', googleMapsUrl: null },
      sessionDate: '2026-08-20',
      startsAt,
      endsAt,
      sessionType: 'standard',
      status: overrides.sessionStatus ?? 'scheduled',
      cancellationNote: null,
    },
  };
}

describe('canCancel, the three hour boundary', () => {
  it('allows it three hours and one minute before start', () => {
    expect(canCancel(booking({ startsInMinutes: 181 }), NOW)).toBe(true);
  });

  it('refuses it two hours and fifty-nine minutes before start', () => {
    expect(canCancel(booking({ startsInMinutes: 179 }), NOW)).toBe(false);
  });

  it('refuses it at exactly three hours, where the client is the stricter of the two', () => {
    // The one instant where the two sides of D23 differ. `isWithinCancellationWindow`
    // (phase 0) is `now < cutoff`; `cancel_own_booking` is
    // `now() > starts_at - interval '3 hours'`, which still allows the instant
    // itself. So for one millisecond the button is hidden on a cancellation
    // the server would have accepted.
    //
    // That is the safe direction and the reason it is left alone: the client
    // never offers a button the server will refuse, which is the failure that
    // would be visible to a player. Asserted rather than corrected so the
    // difference is recorded rather than discovered.
    expect(canCancel(booking({ startsInMinutes: 180 }), NOW)).toBe(false);
  });

  it('refuses a booking he has already cancelled', () => {
    expect(canCancel(booking({ startsInMinutes: 600, status: 'cancelled_by_player' }), NOW)).toBe(
      false,
    );
  });

  it('refuses a booking on a session the coach cancelled', () => {
    expect(canCancel(booking({ startsInMinutes: 600, sessionStatus: 'cancelled' }), NOW)).toBe(
      false,
    );
  });

  it('refuses a session that has already finished', () => {
    // The window compares against the start, so a finished session would pass
    // it on its own. This is the guard that stops *Cancel my reservation*
    // appearing on last night's game.
    expect(canCancel(booking({ startsInMinutes: -300 }), NOW)).toBe(false);
  });
});

describe('isCancellationTooLate', () => {
  it('is the state that gets 9.2’s WhatsApp copy', () => {
    // D24: inside the last three hours only the coach can remove him.
    expect(isCancellationTooLate(booking({ startsInMinutes: 179 }), NOW)).toBe(true);
  });

  it('is false while he can still cancel himself', () => {
    expect(isCancellationTooLate(booking({ startsInMinutes: 181 }), NOW)).toBe(false);
  });

  it('is false once the session is over, which is a different state', () => {
    expect(isCancellationTooLate(booking({ startsInMinutes: -300 }), NOW)).toBe(false);
  });

  it('is false on a cancelled session', () => {
    expect(
      isCancellationTooLate(booking({ startsInMinutes: 60, sessionStatus: 'cancelled' }), NOW),
    ).toBe(false);
  });
});

describe('splitBookings, 14.9’s two segments', () => {
  it('puts a session still to come under upcoming', () => {
    const segments = splitBookings([booking({ startsInMinutes: 600 })], NOW);

    expect(segments.upcoming).toHaveLength(1);
    expect(segments.past).toHaveLength(0);
  });

  it('puts a finished session under past', () => {
    const segments = splitBookings([booking({ startsInMinutes: -300 })], NOW);

    expect(segments.past).toHaveLength(1);
    expect(segments.upcoming).toHaveLength(0);
  });

  it('keeps the last 30 days and hides what is older', () => {
    // 5.2: "The player's my bookings list shows past bookings for 30 days,
    // then hides them."
    const justInside = booking({ id: 'inside', startsInMinutes: -29 * 24 * 60 });
    const justOutside = booking({ id: 'outside', startsInMinutes: -31 * 24 * 60 });

    const segments = splitBookings([justInside, justOutside], NOW);

    expect(segments.past.map((row) => row.id)).toEqual(['inside']);
  });

  it('drops a booking he cancelled from both lists', () => {
    const segments = splitBookings(
      [booking({ startsInMinutes: 600, status: 'cancelled_by_player' })],
      NOW,
    );

    expect(segments.upcoming).toHaveLength(0);
    expect(segments.past).toHaveLength(0);
  });

  it('drops one the coach removed from both lists', () => {
    const segments = splitBookings(
      [booking({ startsInMinutes: 600, status: 'cancelled_by_admin' })],
      NOW,
    );

    expect(segments.upcoming).toHaveLength(0);
    expect(segments.past).toHaveLength(0);
  });

  it('keeps a cancelled session under upcoming, so the banner has somewhere to appear', () => {
    // 14.7 has a red banner for a cancelled session and the player needs
    // somewhere to see it. His booking is still his until the night passes.
    const segments = splitBookings(
      [booking({ startsInMinutes: 600, sessionStatus: 'cancelled' })],
      NOW,
    );

    expect(segments.upcoming).toHaveLength(1);
  });

  it('sorts upcoming soonest first and past most recent first', () => {
    const soon = booking({ id: 'soon', startsInMinutes: 120 });
    const later = booking({ id: 'later', startsInMinutes: 4000 });
    const yesterday = booking({ id: 'yesterday', startsInMinutes: -24 * 60 });
    const lastWeek = booking({ id: 'lastWeek', startsInMinutes: -7 * 24 * 60 });

    const segments = splitBookings([later, lastWeek, soon, yesterday], NOW);

    expect(segments.upcoming.map((row) => row.id)).toEqual(['soon', 'later']);
    expect(segments.past.map((row) => row.id)).toEqual(['yesterday', 'lastWeek']);
  });

  it('settles a reviewed booking into past, not upcoming', () => {
    // 5.6: settled means the coach has reviewed the row's payment. The session
    // is over either way, and that is what decides the segment.
    const segments = splitBookings([booking({ startsInMinutes: -300, status: 'settled' })], NOW);

    expect(segments.past).toHaveLength(1);
  });
});
