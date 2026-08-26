/**
 * Server error codes from the session RPCs, turned into string keys.
 *
 * Appendix A is the register. A `RAISE EXCEPTION 'capacity_below_bookings'`
 * reaches the client as a PostgrestError with code `P0001` and the raised text
 * as its message, so the text is what this matches on. Nothing ever renders
 * `error.message` itself: it is English and written for a developer.
 *
 * Three codes are not in Appendix A and were added by this phase under the
 * section 0 rule 2 procedure — see BUILD-SPEC assumption A33.
 */

export type SessionErrorCode =
  | 'not_authorized'
  | 'session_not_found'
  | 'session_locked'
  | 'session_not_open'
  | 'capacity_below_bookings'
  | 'session_time_taken'
  | 'invalid_duration'
  | 'invalid_court_count'
  | 'invalid_price'
  | 'venue_not_found'
  /** D62/A15: session_instances' own CHECK caps rotation_count at 10. */
  | 'rotation_count_at_maximum'
  | 'network'
  | 'unknown';

export interface AppSessionError {
  code: SessionErrorCode;
  messageKey: string;
}

const MESSAGE_KEYS: Record<SessionErrorCode, string> = {
  not_authorized: 'error.generic',
  session_not_found: 'error.sessionNotFound',
  session_locked: 'admin.error.sessionLocked',
  session_not_open: 'error.sessionCancelled',
  // Interpolated with booked, courts and capacity by the caller.
  capacity_below_bookings: 'admin.error.capacityBelowBookings',
  session_time_taken: 'admin.error.sessionTimeTaken',
  invalid_duration: 'admin.error.invalidDuration',
  invalid_court_count: 'admin.error.invalidCourtCount',
  invalid_price: 'admin.error.invalidPrice',
  venue_not_found: 'admin.error.venueNotFound',
  rotation_count_at_maximum: 'admin.board.error.rotationCountAtMaximum',
  network: 'error.network',
  unknown: 'error.generic',
};

const KNOWN_CODES = new Set<string>(Object.keys(MESSAGE_KEYS));

function isSessionErrorCode(value: string): value is SessionErrorCode {
  return KNOWN_CODES.has(value);
}

export function toAppSessionError(error: unknown): AppSessionError {
  // fetch rejects with a TypeError when the phone has no connection. D78: the
  // app is online only, so this is a real state and it needs its own copy.
  if (error instanceof TypeError) {
    return { code: 'network', messageKey: MESSAGE_KEYS.network };
  }

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      const raised = message.trim();
      if (isSessionErrorCode(raised)) {
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

export function sessionErrorMessageKey(error: unknown): string {
  return toAppSessionError(error).messageKey;
}

/**
 * True when a read failed because the phone is offline rather than because the
 * server refused. 14.6 wants a different banner for each.
 */
export function isOfflineError(error: unknown): boolean {
  return toAppSessionError(error).code === 'network';
}
