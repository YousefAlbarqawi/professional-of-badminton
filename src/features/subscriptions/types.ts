/**
 * Subscription and credit types. BUILD-SPEC section 11, 14.13, 15.8 section 5,
 * 15.9, 15.10.
 *
 * ── The one invariant every type here obeys ───────────────
 * A subscription has no balance of its own. Section 6.2 and D56: "The credit
 * balance of a subscription is always SUM(delta) over credit_transactions.
 * There is no cached counter column." So `Subscription` carries the ledger it
 * is the sum of, and `remainingCredits` in `creditLedger.ts` computes the
 * number. Nothing in this file stores one, and nothing should be added that
 * does — a second answer to a question that already has one is how a ledger
 * stops being trusted.
 *
 * ── The other one ─────────────────────────────────────────
 * `perVisitFils` is a snapshot taken at grant time (11.1), and it is what a
 * credit is worth (12.2 rule 1) — never the session price. Phase 9's revenue
 * figures rest on that distinction, which is why the field is on the
 * subscription rather than looked up from the package.
 */
import type { Fils } from '@/lib/money';
import type { Database } from '@/types/database';

export type CreditReason = Database['public']['Enums']['credit_reason'];

/** One of D48's five. Never purchasable in the app — D49, section 4 item 8. */
export interface Package {
  id: string;
  nameEn: string;
  nameAr: string;
  visitCount: number;
  priceFils: Fils;
  durationMonths: number;
  /** 11.1's per-visit rate, generated from price ÷ visits. See C2. */
  perVisitFils: Fils;
  displayOrder: number;
}

/** One movement in the append-only ledger. D56. */
export interface CreditTransaction {
  id: string;
  subscriptionId: string;
  /** Positive adds, negative spends. Never zero — the column forbids it. */
  delta: number;
  reason: CreditReason;
  /** Required on a `manual_adjustment` (11.3), optional on a grant. */
  note: string | null;
  bookingId: string | null;
  createdAt: string;
}

/**
 * One subscription, with the ledger that defines its balance.
 *
 * `isVoided` is set by the nightly expiry job (11.5) *after* it has written
 * the transaction that brings the balance to zero, so a voided subscription
 * always sums to zero and its history still says where the credits went.
 */
export interface Subscription {
  id: string;
  playerId: string;
  packageNameEn: string;
  packageNameAr: string;
  grantedVisits: number;
  perVisitFils: Fils;
  startsOn: string;
  expiresOn: string;
  isVoided: boolean;
  note: string | null;
  createdAt: string;
  transactions: CreditTransaction[];
}

/** 15.9's form, after validation. */
export interface GrantSubscriptionInput {
  playerId: string;
  packageId: string;
  startsOn: string;
  expiresOn: string;
  grantedVisits: number;
  note: string | null;
}

/** 15.10's form. The note is required — 11.3, D56. */
export interface AdjustCreditsInput {
  subscriptionId: string;
  delta: number;
  note: string;
}

export interface ExtendSubscriptionInput {
  subscriptionId: string;
  expiresOn: string;
}

/** What the player would spend if he paid by credit right now. 14.8. */
export interface CreditSummary {
  /** Across every live subscription with a balance. */
  total: number;
  /**
   * When the credit that would actually be spent expires, as `yyyy-MM-dd`.
   * 11.4 and `pick_subscription`: nearest expiry first, so this is the expiry
   * of the subscription the booking would come out of — not the furthest away.
   */
  nextExpiry: string | null;
  /** True when a credit booking would succeed. 9.1 rule 9. */
  hasUsableCredit: boolean;
}
