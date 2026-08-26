/**
 * The rules that turn a ledger into the numbers on a screen.
 * BUILD-SPEC 11.4, 11.5, 11.6, 14.13, D54, D56.
 *
 * Pure, so that every one of them can be asserted without a database, a
 * navigator or a clock. The client's copy of a rule the server also holds is
 * for drawing the right control, never for deciding what is allowed: 5.1 makes
 * the server the authority on time, and the RPCs in migration 0029 re-check
 * everything below.
 *
 * ── The rule this whole file exists to keep ───────────────
 * "The credit balance of a subscription is always
 *  SELECT COALESCE(SUM(delta),0) FROM credit_transactions
 *  WHERE subscription_id = $1. There is no cached counter column."
 *                                          — section 6.2, and D56
 *
 * `remainingCredits` is that sum and nothing else. It is deliberately the only
 * way anything in the app computes a balance, so that there is one place to
 * look when a number is questioned — and so that nobody can add a counter as
 * an optimisation without deleting this function first.
 */
import type { CreditReason, CreditTransaction, Subscription } from './types';

/** 11.6: "a warning chip when fewer than 7 days remain". */
export const EXPIRY_WARNING_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTHS_PER_YEAR = 12;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Gregorian, which is the calendar every date in this app is written in. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 31;
}

/**
 * The balance of one subscription: the sum of its ledger.
 *
 * Not a stored figure, not a cached one, not a column. If this number ever
 * looks wrong, the transactions it added up are on the same screen and they
 * explain it — which is the whole reason D56 made the ledger append only.
 */
export function remainingCredits(subscription: Subscription): number {
  return subscription.transactions.reduce((sum, txn) => sum + txn.delta, 0);
}

/**
 * Whether a credit on this subscription can be spent today.
 *
 * The three clauses are `pick_subscription`'s, in the same order (8.2, 11.4),
 * because a screen that offers a credit the server then refuses is worse than
 * one that offers nothing. A subscription expiring today is usable all of
 * today: the server compares `expires_on >= amman_today()` and so does this.
 */
export function isUsable(subscription: Subscription, today: string): boolean {
  if (subscription.isVoided) return false;
  if (subscription.expiresOn < today) return false;
  return remainingCredits(subscription) > 0;
}

/**
 * Live or finished, as 14.13 splits the screen: active subscriptions first,
 * "expired subscriptions appear in a collapsed section".
 *
 * Voided is one half of finished and the date is the other, for the reason
 * `extend_subscription` checks both: `is_voided` says whether the 03:20 job
 * has run, `expires_on` says what the clock says, and the hours between them
 * must not be a window where a dead subscription still looks alive.
 *
 * A live subscription with no credits left is still live. It has not expired,
 * the coach can still adjust it, and hiding it in the expired section would
 * make a player who has used all eight visits look like a player who never had
 * a subscription at all.
 */
export function isExpired(subscription: Subscription, today: string): boolean {
  return subscription.isVoided || subscription.expiresOn < today;
}

/** Whole days from today until the expiry date, negative once it has passed. */
export function daysUntilExpiry(expiresOn: string, today: string): number {
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${expiresOn}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / MS_PER_DAY);
}

/** 11.6 and 14.13: the chip that appears inside the last week. */
export function isExpiringSoon(subscription: Subscription, today: string): boolean {
  if (isExpired(subscription, today)) return false;
  const days = daysUntilExpiry(subscription.expiresOn, today);
  return days >= 0 && days < EXPIRY_WARNING_DAYS;
}

export interface SplitSubscriptions {
  active: Subscription[];
  expired: Subscription[];
  /** 11.6: "Total credits remaining across all active subscriptions." */
  totalRemaining: number;
}

/**
 * 14.13 and 15.8 section 5, in one pass.
 *
 * Active are ordered by nearest expiry first, which is not a display
 * preference: it is the order 11.4 spends them in, so the card at the top is
 * the one the next booking will come out of. Expired are ordered by the most
 * recently expired first, because that is the one somebody is asking about.
 */
export function splitSubscriptions(
  subscriptions: readonly Subscription[],
  today: string,
): SplitSubscriptions {
  const active: Subscription[] = [];
  const expired: Subscription[] = [];

  for (const subscription of subscriptions) {
    if (isExpired(subscription, today)) expired.push(subscription);
    else active.push(subscription);
  }

  active.sort(
    (a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.createdAt.localeCompare(b.createdAt),
  );
  expired.sort((a, b) => b.expiresOn.localeCompare(a.expiresOn));

  return {
    active,
    expired,
    totalRemaining: active.reduce((sum, s) => sum + remainingCredits(s), 0),
  };
}

/**
 * Every movement across every subscription, newest first. 14.13's history:
 * "so a player can see exactly where his credits went".
 *
 * Expired subscriptions are included. Their ledger is where the `expiry` row
 * lives, and that row is the answer to the only question anybody asks about an
 * expired subscription.
 */
export function ledgerHistory(subscriptions: readonly Subscription[]): CreditTransaction[] {
  return subscriptions
    .flatMap((subscription) => subscription.transactions)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

const REASON_KEYS: Record<CreditReason, string> = {
  grant: 'subscriptions.reasonGrant',
  booking: 'subscriptions.reasonBooking',
  booking_refund: 'subscriptions.reasonRefund',
  expiry: 'subscriptions.reasonExpiry',
  manual_adjustment: 'subscriptions.reasonAdjustment',
  session_cancelled: 'subscriptions.reasonSessionCancelled',
};

/** D56: "a reason on every movement". This is how the player reads it. */
export function reasonLabelKey(reason: CreditReason): string {
  return REASON_KEYS[reason];
}

/**
 * 15.9's expiry auto-fill: "Expiry auto-fills to start + duration months, and
 * is editable."
 *
 * Calendar months, clamped to the end of the target month, so 31 January plus
 * one month is 28 February rather than 3 March. `grant_subscription` computes
 * the same default with `make_interval(months => n)`, which clamps the same
 * way, so the date the coach sees before saving is the date he would have got
 * had he left the field alone.
 *
 * Arithmetic on the three numbers rather than on a `Date`. 5.1 bans `new
 * Date()` in business logic and this is business logic; more to the point, a
 * calendar day has no time and no zone, and routing it through an instant
 * would give it both and then have to take them away again.
 */
export function addMonths(dayKey: string, months: number): string {
  const [yearText, monthText, dayText] = dayKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dayKey;

  // Months counted from zero so the division carries the year correctly for a
  // negative offset as well as a positive one.
  const total = year * MONTHS_PER_YEAR + (month - 1) + months;
  const targetYear = Math.floor(total / MONTHS_PER_YEAR);
  const targetMonth = total - targetYear * MONTHS_PER_YEAR + 1;

  const yyyy = String(targetYear).padStart(4, '0');
  const mm = String(targetMonth).padStart(2, '0');
  const dd = String(Math.min(day, daysInMonth(targetYear, targetMonth))).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}
