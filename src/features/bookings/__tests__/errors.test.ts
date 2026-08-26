/**
 * Every server error code becomes the message key Appendix A pins to it.
 *
 * This is the other half of supabase/tests/createBooking.test.ts. That file
 * proves the server raises the right code; this one proves the client turns it
 * into the right sentence. Between them, every row of section 9.1 goes from
 * rule to copy.
 */
import { bookingErrorMessageKey, isSessionFull, toAppBookingError } from '../errors';

/** What PostgREST hands back when a plpgsql function raises. */
function raised(code: string): { message: string; code: string } {
  return { message: code, code: 'P0001' };
}

describe('section 9.1, code to message key', () => {
  const table: readonly [string, string][] = [
    ['session_not_found', 'error.sessionNotFound'],
    ['session_not_open', 'error.sessionCancelled'],
    ['outside_booking_window', 'error.tooFarAhead'],
    ['booking_window_closed', 'error.bookingClosed'],
    ['email_not_confirmed', 'error.confirmEmailFirst'],
    ['account_deleted', 'error.accountDeleted'],
    ['already_booked', 'error.alreadyBooked'],
    ['session_full', 'error.sessionFull'],
    ['no_credits_available', 'error.noCredits'],
  ];

  it.each(table)('%s -> %s', (code, key) => {
    expect(bookingErrorMessageKey(raised(code))).toBe(key);
  });
});

describe('section 9.2, the cancellation codes', () => {
  it('not_your_booking is deliberately generic', () => {
    // Appendix A maps it to error.generic: a player who asked to cancel
    // somebody else's booking does not need to be told it exists.
    expect(bookingErrorMessageKey(raised('not_your_booking'))).toBe('error.generic');
  });

  it('already_cancelled and cancellation_window_closed have their own copy', () => {
    expect(bookingErrorMessageKey(raised('already_cancelled'))).toBe('error.alreadyCancelled');
    expect(bookingErrorMessageKey(raised('cancellation_window_closed'))).toBe(
      'error.cancellationWindowClosed',
    );
  });
});

describe('the staff codes', () => {
  it('maps a locked session and an unauthorised caller', () => {
    expect(bookingErrorMessageKey(raised('session_locked'))).toBe('admin.error.sessionLocked');
    expect(bookingErrorMessageKey(raised('not_authorized'))).toBe('error.generic');
  });

  it('maps the guest and coach validation codes', () => {
    expect(bookingErrorMessageKey(raised('guest_name_required'))).toBe(
      'admin.error.guestNameRequired',
    );
    expect(bookingErrorMessageKey(raised('not_a_coach'))).toBe('admin.error.notACoach');
  });
});

describe('the two methods a player cannot pick (A37)', () => {
  it('says nothing useful about free, which the UI never offers', () => {
    expect(bookingErrorMessageKey(raised('payment_method_not_allowed'))).toBe('error.generic');
  });

  it('explains CliQ, which he can see and cannot yet use', () => {
    expect(bookingErrorMessageKey(raised('cliq_requires_proof'))).toBe('error.generic');
  });
});

describe('everything else', () => {
  it('reads a dropped connection as the network, not as a server refusal', () => {
    // D78: the app is online only, so this is a real state with its own copy.
    expect(toAppBookingError(new TypeError('Network request failed')).code).toBe('network');
    expect(bookingErrorMessageKey({ message: 'Failed to fetch' })).toBe('error.network');
  });

  it('falls back to the generic message for anything unrecognised', () => {
    expect(bookingErrorMessageKey(raised('something_new'))).toBe('error.generic');
    expect(bookingErrorMessageKey(null)).toBe('error.generic');
    expect(bookingErrorMessageKey(undefined)).toBe('error.generic');
  });

  it('tolerates whitespace around the raised text', () => {
    expect(bookingErrorMessageKey({ message: '  session_full  ' })).toBe('error.sessionFull');
  });
});

describe('isSessionFull', () => {
  it('is true only for the lost race, which 14.8 presents its own way', () => {
    expect(isSessionFull(raised('session_full'))).toBe(true);
    expect(isSessionFull(raised('already_booked'))).toBe(false);
    expect(isSessionFull(null)).toBe(false);
  });
});
