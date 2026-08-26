/**
 * Server error codes from the booking RPCs, turned into string keys.
 *
 * Appendix A is the register and section 9.1 pins a message key to every
 * rejection the booking path can produce. A `RAISE EXCEPTION 'session_full'`
 * reaches the client as a PostgrestError with code `P0001` and the raised text
 * as its message, so the text is what this matches on. Nothing ever renders
 * `error.message` itself: it is English and written for a developer.
 *
 * Three codes are not in Appendix A. `payment_method_not_allowed` and
 * `cliq_requires_proof` are A37 and 10.1 — the first is staff-only `free`, the
 * second is a CliQ booking arriving without its screenshot, which the sheet
 * cannot produce because CliQ goes through `create_cliq_booking` instead. The
 * third, `not_a_coach`, belongs to 15.2's add-coach picker. All three are
 * unreachable from the UI, which offers only the choices that work, so each
 * maps to the generic message a crafted call deserves.
 */
export type BookingErrorCode =
  | 'session_not_found'
  | 'session_not_open'
  | 'outside_booking_window'
  | 'booking_window_closed'
  | 'email_not_confirmed'
  | 'account_deleted'
  | 'already_booked'
  | 'session_full'
  | 'no_credits_available'
  | 'not_your_booking'
  | 'already_cancelled'
  | 'cancellation_window_closed'
  | 'session_locked'
  | 'not_authorized'
  | 'payment_method_not_allowed'
  | 'cliq_requires_proof'
  | 'guest_name_required'
  | 'guest_tier_required'
  | 'not_a_coach'
  | 'invalid_price'
  | 'not_a_player_booking'
  | 'invalid_target_session'
  | 'network'
  | 'unknown';

export interface AppBookingError {
  code: BookingErrorCode;
  messageKey: string;
}

/** Appendix A, column three. */
const MESSAGE_KEYS: Record<BookingErrorCode, string> = {
  session_not_found: 'error.sessionNotFound',
  session_not_open: 'error.sessionCancelled',
  outside_booking_window: 'error.tooFarAhead',
  booking_window_closed: 'error.bookingClosed',
  email_not_confirmed: 'error.confirmEmailFirst',
  account_deleted: 'error.accountDeleted',
  already_booked: 'error.alreadyBooked',
  session_full: 'error.sessionFull',
  no_credits_available: 'error.noCredits',
  // Appendix A maps this to the generic message on purpose: a player who has
  // somehow asked to cancel a booking that is not his does not need to be told
  // that the booking exists.
  not_your_booking: 'error.generic',
  already_cancelled: 'error.alreadyCancelled',
  cancellation_window_closed: 'error.cancellationWindowClosed',
  session_locked: 'admin.error.sessionLocked',
  not_authorized: 'error.generic',
  payment_method_not_allowed: 'error.generic',
  cliq_requires_proof: 'error.generic',
  guest_name_required: 'admin.error.guestNameRequired',
  guest_tier_required: 'admin.error.guestTierRequired',
  not_a_coach: 'admin.error.notACoach',
  invalid_price: 'admin.error.invalidPrice',
  // Both unreachable from the UI: the row action offering "Move to another
  // session" is scoped to player rows, and the target picker excludes the
  // session the booking is already on. Both stay in Appendix A for a crafted
  // call.
  not_a_player_booking: 'admin.error.notAPlayerBooking',
  invalid_target_session: 'admin.error.invalidTargetSession',
  network: 'error.network',
  unknown: 'error.generic',
};

const KNOWN_CODES = new Set<string>(Object.keys(MESSAGE_KEYS));

function isBookingErrorCode(value: string): value is BookingErrorCode {
  return KNOWN_CODES.has(value);
}

export function toAppBookingError(error: unknown): AppBookingError {
  // fetch rejects with a TypeError when the phone has no connection. D78: the
  // app is online only, so this is a real state and it needs its own copy.
  if (error instanceof TypeError) {
    return { code: 'network', messageKey: MESSAGE_KEYS.network };
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      const raised = message.trim();
      if (isBookingErrorCode(raised)) {
        return { code: raised, messageKey: MESSAGE_KEYS[raised] };
      }
      if (isNetworkMessage(raised)) {
        return { code: 'network', messageKey: MESSAGE_KEYS.network };
      }
    }
  }

  return { code: 'unknown', messageKey: MESSAGE_KEYS.unknown };
}

function isNetworkMessage(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('network') || text.includes('failed to fetch') || text.includes('load failed')
  );
}

export function bookingErrorMessageKey(error: unknown): string {
  return toAppBookingError(error).messageKey;
}

/**
 * True when the last spot went while he was booking. 14.8 gives this one its
 * own presentation — an apology and a *Join the waiting list* button — rather
 * than the dialog every other failure gets. 9.5: "the UI must present it
 * gently".
 */
export function isSessionFull(error: unknown): boolean {
  return toAppBookingError(error).code === 'session_full';
}
