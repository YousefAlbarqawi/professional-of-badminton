/**
 * Payment and review domain types. BUILD-SPEC 10.1, 10.2, 10.3.
 *
 * These are the staff's types. The player's view of a payment is deliberately
 * thinner — 14.10: "The player is never shown payment_status, whether the coach
 * marked him paid, or any balance" — and lives in features/bookings/types.ts,
 * where the columns he may not see are absent from the type rather than hidden
 * in the JSX.
 */
import type { Fils } from '@/lib/money';
import type { Tier } from '@/lib/tiers';
import type { AttendeeKind, PaymentMethod } from '@/features/bookings/types';
import type { VisibilityLevel } from '@/features/sessions/types';
import type { Database } from '@/types/database';

export type PaymentStatus = Database['public']['Enums']['payment_status'];
export type UserRole = Database['public']['Enums']['user_role'];

/** The methods 10.2's *Change method* may move a booking between. A47. */
export type ReviewablePaymentMethod = Extract<PaymentMethod, 'cash' | 'cliq' | 'free'>;

export const REVIEWABLE_METHODS: readonly ReviewablePaymentMethod[] = ['cash', 'cliq', 'free'];

/** One row of the review screen. 10.2. */
export interface ReviewRow {
  bookingId: string;
  kind: AttendeeKind;
  /** A guest's typed name, or the player's. D44, D46. */
  displayName: string;
  tier: Tier | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** A7: the price he booked at, not today's price. */
  expectedFils: Fils;
  paidFils: Fils;
  /** Null for a guest, who has no account and therefore no balance. */
  playerId: string | null;
  isCoachSlot: boolean;
  /** 10.2's *View proof*, CliQ rows only. Null once A13's purge has run. */
  proofPath: string | null;
  /** 5.6: true once the coach has reviewed this row. */
  isSettled: boolean;
  note: string | null;
}

/**
 * 15.1's card, batched across a whole list rather than fetched once per
 * session — `get_sessions_money_summary` (migration 0039) versus
 * `get_session_money_summary`'s own single-session `MoneySummary` below.
 */
export interface SessionMoneyGlance {
  collectedFils: Fils;
  outstandingFils: Fils;
}

/** 10.2's always-visible footer, valued per 12.2 and 12.3. */
export interface MoneySummary {
  expectedFils: Fils;
  collectedFils: Fils;
  /** 12.2 rule 1: a credit is worth its subscription's rate, never 6 JD. */
  creditRevenueFils: Fils;
  outstandingFils: Fils;
  costFils: Fils;
  profitFils: Fils;
  /** 12.3: "the coach will want both numbers". */
  profitIfCollectedFils: Fils;
  attendeeCount: number;
  unsettledCount: number;
}

export interface RecordPaymentInput {
  bookingId: string;
  sessionId: string;
  paidFils: Fils;
  /** Null leaves the method as it is. 10.2's *Change method* sets it. */
  method: ReviewablePaymentMethod | null;
  note: string | null;
}

/** One entry of 15.8 section 6 and 10.3. */
export interface BalanceEntry {
  id: string;
  amountFils: Fils;
  note: string | null;
  createdAt: Date;
  /** Null for a manual entry, which is not about any one session. */
  sessionId: string | null;
  /** The session's venue and date, for the entry list. Null when manual. */
  sessionLabel: string | null;
}

/** 15.8 section 6: total owed, and every entry. */
export interface PlayerBalance {
  totalOwedFils: Fils;
  entries: BalanceEntry[];
}

/**
 * 15.8 section 1, the identity header the balance sits under — and, since
 * they all live on the same `profiles` row, sections 2 (tier), 3
 * (visibility), 4 (custom rate) and 8 (role) as well.
 */
export interface PlayerIdentity {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  tier: Tier | null;
  joinedAt: Date;
  visibility: VisibilityLevel;
  customRateStandardFils: Fils | null;
  customRateExtendedFils: Fils | null;
  role: UserRole;
}

/**
 * One row of 15.8 section 7: "Last 20 bookings with payment outcomes."
 *
 * A cancelled booking is not an outcome to review — 9.3 never creates money
 * from one — so this is `confirmed`/`settled` only, the same filter
 * `fetchSessionReview` applies to one session's own rows.
 */
export interface PlayerRecentSession {
  bookingId: string;
  sessionId: string;
  venue: string;
  startsAt: Date;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  expectedFils: Fils;
  paidFils: Fils;
}

/**
 * A screenshot, resized and compressed, ready to upload. 10.1 step 4.
 *
 * `bytes` rather than a path because `payment_proofs.file_size_bytes` is NOT
 * NULL and CHECKed against 10 MB (6.2), so the size has to be known before the
 * proof row is written, not inferred afterwards.
 */
export interface PreparedProof {
  uri: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: 'image/jpeg';
}
