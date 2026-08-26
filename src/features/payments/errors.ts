/**
 * Server error codes from the payment and review RPCs, turned into string keys.
 *
 * Same shape as features/bookings/errors.ts, and for the same reason: a
 * `RAISE EXCEPTION 'session_locked'` reaches the client as a PostgrestError
 * with code P0001 and the raised text as its message, so the text is what is
 * matched on. Nothing ever renders `error.message` itself — it is English and
 * written for a developer.
 *
 * Codes Appendix A does not list are A49. Each one is either unreachable from
 * the UI, which offers only the actions that work, or a storage failure that
 * belongs to the CliQ upload rather than to a database function.
 */
export type PaymentErrorCode =
  | 'session_locked'
  | 'session_not_in_review'
  | 'session_not_confirmed'
  | 'booking_not_found'
  | 'already_cancelled'
  | 'invalid_amount'
  | 'credit_change_not_supported'
  | 'not_authorized'
  | 'cliq_requires_proof'
  | 'proof_path_mismatch'
  | 'proof_required'
  | 'upload_failed'
  | 'library_permission_denied'
  | 'camera_permission_denied'
  /** 0009's trg_guard_profile: D16, only a coach may promote to coach. */
  | 'only_coach_can_create_coach'
  | 'not_authorized_to_change_privileged_fields'
  | 'network'
  | 'unknown';

const MESSAGE_KEYS: Record<PaymentErrorCode, string> = {
  session_locked: 'admin.error.sessionLocked',
  session_not_in_review: 'admin.error.sessionNotInReview',
  session_not_confirmed: 'admin.error.sessionNotConfirmed',
  booking_not_found: 'error.sessionNotFound',
  already_cancelled: 'error.alreadyCancelled',
  invalid_amount: 'admin.error.invalidAmount',
  credit_change_not_supported: 'admin.error.creditChangeNotSupported',
  not_authorized: 'error.generic',
  // Unreachable from the sheet, which sends CliQ through its own path. A
  // crafted call deserves the generic message.
  cliq_requires_proof: 'error.generic',
  proof_path_mismatch: 'error.generic',
  proof_required: 'error.uploadFailed',
  upload_failed: 'error.uploadFailed',
  library_permission_denied: 'payment.libraryPermissionDenied',
  camera_permission_denied: 'payment.cameraPermissionDenied',
  only_coach_can_create_coach: 'admin.profile.error.onlyCoachCanPromote',
  // Unreachable: this screen is staff-only, and a non-staff caller never
  // reaches trg_guard_profile's staff branch through it.
  not_authorized_to_change_privileged_fields: 'error.generic',
  network: 'error.network',
  unknown: 'error.generic',
};

const KNOWN_CODES = new Set<string>(Object.keys(MESSAGE_KEYS));

function isPaymentErrorCode(value: string): value is PaymentErrorCode {
  return KNOWN_CODES.has(value);
}

export function toPaymentErrorCode(error: unknown): PaymentErrorCode {
  // D78: the app is online only, so a dropped connection is a real state with
  // its own copy rather than a crash.
  if (error instanceof TypeError) return 'network';

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      const raised = message.trim();
      if (isPaymentErrorCode(raised)) return raised;

      const text = raised.toLowerCase();
      if (
        text.includes('network') ||
        text.includes('failed to fetch') ||
        text.includes('load failed')
      ) {
        return 'network';
      }
      // A StorageApiError from the proof upload. 10.1: "If the upload fails,
      // no booking is created and the player sees a retry option."
      if (text.includes('storage') || text.includes('bucket') || text.includes('object')) {
        return 'upload_failed';
      }
    }
  }

  return 'unknown';
}

export function paymentErrorMessageKey(error: unknown): string {
  return MESSAGE_KEYS[toPaymentErrorCode(error)];
}

/** True when the session locked underneath the coach while he had it open. */
export function isSessionLocked(error: unknown): boolean {
  return toPaymentErrorCode(error) === 'session_locked';
}
