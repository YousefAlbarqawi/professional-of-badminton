/**
 * Server error codes from the subscription RPCs, turned into string keys.
 *
 * Same shape and the same reasoning as `features/payments/errors.ts`: a
 * `RAISE EXCEPTION 'subscription_expired'` reaches the client as a
 * PostgrestError with code P0001 and the raised text as its message, so the
 * text is what is matched on. Nothing ever renders `error.message` itself — it
 * is English and written for a developer.
 *
 * Six codes here are not in Appendix A, which predates these three functions
 * existing. Each has a key in the `admin.error` namespace in both decks; the
 * ones a well-behaved screen cannot provoke map to the generic message, which
 * is what a crafted call deserves.
 */
export type SubscriptionErrorCode =
  | 'not_authorized'
  | 'player_not_found'
  | 'account_deleted'
  | 'package_not_found'
  | 'subscription_not_found'
  | 'subscription_expired'
  | 'subscription_voided'
  | 'invalid_expiry'
  | 'invalid_visit_count'
  | 'invalid_amount'
  | 'insufficient_credits'
  | 'note_required'
  | 'network'
  | 'unknown';

const MESSAGE_KEYS: Record<SubscriptionErrorCode, string> = {
  // D55: the extend button is drawn only for the coach, so an admin reaching
  // this is a crafted call — but a coach whose role was changed while the
  // screen was open is not, and he deserves to be told which action failed.
  not_authorized: 'admin.error.coachOnly',
  player_not_found: 'error.generic',
  account_deleted: 'error.accountDeleted',
  package_not_found: 'error.generic',
  subscription_not_found: 'error.generic',
  subscription_expired: 'admin.error.subscriptionExpired',
  subscription_voided: 'admin.error.subscriptionExpired',
  invalid_expiry: 'admin.error.invalidExpiry',
  invalid_visit_count: 'admin.error.invalidVisitCount',
  invalid_amount: 'admin.error.invalidAmount',
  insufficient_credits: 'admin.error.insufficientCredits',
  note_required: 'validation.noteRequired',
  network: 'error.network',
  unknown: 'error.generic',
};

const KNOWN_CODES = new Set<string>(Object.keys(MESSAGE_KEYS));

function isSubscriptionErrorCode(value: string): value is SubscriptionErrorCode {
  return KNOWN_CODES.has(value);
}

export function toSubscriptionErrorCode(error: unknown): SubscriptionErrorCode {
  // D78: the app is online only, so a dropped connection is a real state with
  // its own copy rather than a crash.
  if (error instanceof TypeError) return 'network';

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      const raised = message.trim();
      if (isSubscriptionErrorCode(raised)) return raised;

      const text = raised.toLowerCase();
      if (
        text.includes('network') ||
        text.includes('failed to fetch') ||
        text.includes('load failed')
      ) {
        return 'network';
      }
    }
  }

  return 'unknown';
}

export function subscriptionErrorMessageKey(error: unknown): string {
  return MESSAGE_KEYS[toSubscriptionErrorCode(error)];
}
