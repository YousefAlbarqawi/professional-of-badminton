/**
 * What the review screen may do, and what it should say. BUILD-SPEC 10.2, D39.
 *
 * Pure functions, no React and no Supabase, so the rules can be tested without
 * a renderer and without a database. The screen reads them; it does not
 * re-derive them.
 */
import type { Fils } from '@/lib/money';
import { reviewDeadline } from '@/lib/time';
import type { SessionStatus } from '@/features/sessions/types';

import type { MoneySummary, PaymentStatus, ReviewRow } from './types';

/**
 * The state of the whole screen. 10.2:
 *
 *   "Reachable from a session that is pending_review or confirmed, until it
 *    locks. [...] After that the session is locked and every control becomes
 *    read only, with a note explaining why. There is no unlock."
 */
export type ReviewAvailability =
  /** 5.5: still to be played, or being played. Money can be taken; there is nothing to confirm. */
  | 'early'
  /** The session has ended and is waiting. The common case. */
  | 'open'
  /** Confirmed at least once, still editable for 7 days. */
  | 'confirmed'
  /** D39. Read only, permanently. */
  | 'locked'
  /** 9.4: cancelled sessions have no review. */
  | 'cancelled';

export interface ReviewGate {
  availability: ReviewAvailability;
  /** False once the 7 day window has closed. Every control follows this. */
  canEdit: boolean;
  /** 10.2's *Confirm session*, which only makes sense after the session ends. */
  canConfirm: boolean;
  /** 8.5's reopen, offered instead of confirm once it has been confirmed. */
  canReopen: boolean;
  /** The read-only note, or null. */
  noticeKey: string | null;
}

/**
 * The 7 day rule, decided from the clock as well as the status.
 *
 * `assert_session_unlocked` in the database does the same thing for the same
 * reason: the nightly job that writes `locked` runs at 03:10 (8.6), so between
 * the deadline passing and the job firing a session is over its window and
 * still says `pending_review`. The server would refuse a mutation in those
 * hours; the screen should not offer one.
 */
export function reviewGate(status: SessionStatus, endsAt: Date, now: Date): ReviewGate {
  const isPastDeadline = now > reviewDeadline(endsAt);

  if (status === 'cancelled') {
    return {
      availability: 'cancelled',
      canEdit: false,
      canConfirm: false,
      canReopen: false,
      noticeKey: 'admin.money.cancelledNotice',
    };
  }

  if (status === 'locked' || isPastDeadline) {
    return {
      availability: 'locked',
      canEdit: false,
      canConfirm: false,
      canReopen: false,
      noticeKey: 'admin.money.lockedNotice',
    };
  }

  if (status === 'confirmed') {
    return {
      availability: 'confirmed',
      canEdit: true,
      canConfirm: true,
      canReopen: true,
      noticeKey: 'admin.money.confirmedNotice',
    };
  }

  if (status === 'pending_review') {
    return {
      availability: 'open',
      canEdit: true,
      canConfirm: true,
      canReopen: false,
      noticeKey: null,
    };
  }

  // scheduled or in_progress. D22 lets the coach work during the session, and
  // 8.5's only session rule is the lock — so he may take money at the door.
  // There is nothing to confirm until it has been played.
  return {
    availability: 'early',
    canEdit: true,
    canConfirm: false,
    canReopen: false,
    noticeKey: 'admin.money.earlyNotice',
  };
}

/** The chip on a review row. 10.2. */
export function statusLabelKey(status: PaymentStatus): string {
  return {
    paid: 'admin.money.statusPaid',
    partial: 'admin.money.statusPartial',
    unpaid: 'admin.money.statusUnpaid',
    waived: 'admin.money.statusWaived',
  }[status];
}

export function statusTone(status: PaymentStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  return {
    paid: 'success' as const,
    partial: 'warning' as const,
    unpaid: 'danger' as const,
    // Waived is not a problem to be fixed. A free guest, a zero custom rate
    // and a coach slot all land here. D45, D47, 12.2 rule 2.
    waived: 'neutral' as const,
  }[status];
}

/** What this row still owes. Never negative: the server refuses an overpayment. */
export function outstandingOn(row: ReviewRow): Fils {
  return Math.max(0, row.expectedFils - row.paidFils) as Fils;
}

/**
 * Whether 10.2's *Mark paid* would change anything.
 *
 * A row expecting nothing is already settled in the only sense that matters,
 * and offering a one-tap action that does nothing trains the coach to distrust
 * the screen.
 */
export function canMarkPaid(row: ReviewRow): boolean {
  return row.expectedFils > 0 && row.paidFils !== row.expectedFils;
}

/** 10.2's *View proof*, CliQ rows only, and only while the image still exists. */
export function canViewProof(row: ReviewRow): boolean {
  return row.paymentMethod === 'cliq' && row.proofPath !== null;
}

/**
 * A47: a credit booking cannot change method here, because moving it off
 * credit would strand the ledger row that paid for it. The coach's route is
 * *Remove from session*, which returns the credit, and then re-add.
 */
export function canChangeMethod(row: ReviewRow): boolean {
  return row.paymentMethod !== 'credit';
}

/**
 * The footer, computed from the rows on screen rather than fetched again.
 *
 * The server's `get_session_money_summary` is the authority and carries the
 * cost and profit, which the client cannot know. This exists so the three
 * money totals move the instant a row is marked paid, instead of blinking a
 * refetch later. The two agree by construction: both are sums over the same
 * confirmed and settled rows.
 */
export function totalsFromRows(rows: ReviewRow[]): {
  expectedFils: Fils;
  collectedFils: Fils;
  outstandingFils: Fils;
} {
  let expected = 0;
  let collected = 0;

  for (const row of rows) {
    expected += row.expectedFils;
    // 12.2 rule 3: unpaid amounts are not revenue, and a credit is counted at
    // its subscription's rate by the server, not here.
    if (row.paymentMethod === 'cash' || row.paymentMethod === 'cliq') {
      collected += row.paidFils;
    }
  }

  return {
    expectedFils: expected as Fils,
    collectedFils: collected as Fils,
    outstandingFils: (expected - rows.reduce((sum, row) => sum + row.paidFils, 0)) as Fils,
  };
}

/** Merges the server's summary with the totals the rows already imply. */
export function mergeSummary(summary: MoneySummary | undefined, rows: ReviewRow[]): MoneySummary {
  const totals = totalsFromRows(rows);

  return {
    ...totals,
    creditRevenueFils: summary?.creditRevenueFils ?? (0 as Fils),
    costFils: summary?.costFils ?? (0 as Fils),
    profitFils: (totals.collectedFils +
      (summary?.creditRevenueFils ?? 0) -
      (summary?.costFils ?? 0)) as Fils,
    profitIfCollectedFils: (totals.collectedFils +
      totals.outstandingFils +
      (summary?.creditRevenueFils ?? 0) -
      (summary?.costFils ?? 0)) as Fils,
    attendeeCount: rows.length,
    unsettledCount: rows.filter((row) => !row.isSettled).length,
  };
}
