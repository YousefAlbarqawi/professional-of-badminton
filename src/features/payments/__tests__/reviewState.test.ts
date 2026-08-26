/**
 * The review screen's rules. BUILD-SPEC 10.2, 12.2, 12.3, D39, D45, D47, A47.
 *
 * These are the rules the screen reads rather than re-derives, so they are
 * tested here once instead of through a renderer six times.
 */
import { addDays, addHours, addMinutes } from 'date-fns';

import {
  canChangeMethod,
  canMarkPaid,
  canViewProof,
  mergeSummary,
  outstandingOn,
  reviewGate,
  statusTone,
  totalsFromRows,
} from '../reviewState';
import type { MoneySummary, ReviewRow } from '../types';
import type { Fils } from '@/lib/money';

const NOW = new Date('2026-08-20T18:00:00.000Z');

function row(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    bookingId: 'b1',
    kind: 'player',
    displayName: 'A Player',
    tier: 'B',
    paymentMethod: 'cash',
    paymentStatus: 'unpaid',
    expectedFils: 6000 as Fils,
    paidFils: 0 as Fils,
    playerId: 'p1',
    isCoachSlot: false,
    proofPath: null,
    isSettled: false,
    note: null,
    ...overrides,
  };
}

describe('the 7 day rule', () => {
  const endedAt = addHours(NOW, -2);

  it('opens on a session waiting to be reviewed', () => {
    const gate = reviewGate('pending_review', endedAt, NOW);
    expect(gate).toMatchObject({
      availability: 'open',
      canEdit: true,
      canConfirm: true,
      canReopen: false,
      noticeKey: null,
    });
  });

  it('keeps a confirmed session editable, and offers the reopen', () => {
    // D39: "Within it, everything is editable." 8.5 makes confirm reversible.
    const gate = reviewGate('confirmed', endedAt, NOW);
    expect(gate).toMatchObject({ canEdit: true, canConfirm: true, canReopen: true });
  });

  it('lets the coach take money at the door before the session ends', () => {
    // D22 lets him work during the session, and 8.5's only session rule is the
    // lock. There is nothing to confirm until it has been played.
    const gate = reviewGate('scheduled', addHours(NOW, 2), NOW);
    expect(gate).toMatchObject({ availability: 'early', canEdit: true, canConfirm: false });
  });

  it('closes everything once the session is locked', () => {
    const gate = reviewGate('locked', addDays(NOW, -9), NOW);
    expect(gate).toMatchObject({
      availability: 'locked',
      canEdit: false,
      canConfirm: false,
      canReopen: false,
      noticeKey: 'admin.money.lockedNotice',
    });
  });

  it('closes on the deadline, before the nightly job has written locked', () => {
    // 8.6 runs the lock job at 03:10 Amman. For the hours between the window
    // closing and the job firing, a session is over its deadline and still
    // says pending_review. The server refuses a mutation in those hours, so
    // the screen must not offer one. Same reasoning as
    // assert_session_unlocked in migration 0026.
    const eightDaysAgo = addDays(NOW, -8);
    expect(reviewGate('pending_review', eightDaysAgo, NOW).canEdit).toBe(false);
    expect(reviewGate('confirmed', eightDaysAgo, NOW).availability).toBe('locked');
  });

  it('is still open one minute inside the deadline', () => {
    const almost = addMinutes(addDays(NOW, -7), 1);
    expect(reviewGate('pending_review', almost, NOW).canEdit).toBe(true);
  });

  it('has nothing to review on a cancelled session', () => {
    // 9.4 gives it a terminal state of its own, with its credits already back.
    const gate = reviewGate('cancelled', endedAt, NOW);
    expect(gate).toMatchObject({ availability: 'cancelled', canEdit: false, canConfirm: false });
  });
});

describe('what each row offers', () => {
  it('offers Mark paid only when it would change something', () => {
    expect(canMarkPaid(row())).toBe(true);
    expect(canMarkPaid(row({ paidFils: 6000 as Fils }))).toBe(false);
    // D45 and D47: a free guest and a coach slot expect nothing, so there is
    // nothing to mark. 12.2 rule 2 says the same of a 0 JD custom rate.
    expect(canMarkPaid(row({ expectedFils: 0 as Fils }))).toBe(false);
  });

  it('offers View proof on a CliQ row that still has one', () => {
    expect(canViewProof(row({ paymentMethod: 'cliq', proofPath: 'p1/b1.jpg' }))).toBe(true);
    expect(canViewProof(row({ paymentMethod: 'cash', proofPath: 'p1/b1.jpg' }))).toBe(false);
    // A13 purges the image after 365 days and the row with it.
    expect(canViewProof(row({ paymentMethod: 'cliq' }))).toBe(false);
  });

  it('does not offer Change method on a credit row', () => {
    // A47: moving it off credit would strand the ledger row that paid for it.
    expect(canChangeMethod(row({ paymentMethod: 'credit' }))).toBe(false);
    expect(canChangeMethod(row())).toBe(true);
  });

  it('never reports a negative outstanding', () => {
    expect(outstandingOn(row({ paidFils: 4000 as Fils }))).toBe(2000);
    expect(outstandingOn(row({ paidFils: 6000 as Fils }))).toBe(0);
  });

  it('does not treat a waived row as a problem', () => {
    // Colour carries meaning on this screen, and a free guest is not a debt.
    expect(statusTone('waived')).toBe('neutral');
    expect(statusTone('unpaid')).toBe('danger');
    expect(statusTone('partial')).toBe('warning');
    expect(statusTone('paid')).toBe('success');
  });
});

describe('the footer totals', () => {
  const rows = [
    row({ bookingId: 'a', paidFils: 6000 as Fils, paymentStatus: 'paid' }),
    row({ bookingId: 'b', paidFils: 2000 as Fils, paymentStatus: 'partial' }),
    // 12.2 rule 1: a credit expects nothing here and is valued by the server
    // at its subscription's per-visit rate.
    row({
      bookingId: 'c',
      paymentMethod: 'credit',
      expectedFils: 0 as Fils,
      paymentStatus: 'paid',
    }),
    // 12.2 rule 2: a free guest takes a slot and contributes nothing.
    row({
      bookingId: 'd',
      kind: 'guest',
      playerId: null,
      paymentMethod: 'free',
      expectedFils: 0 as Fils,
      paymentStatus: 'waived',
    }),
  ];

  it('adds up expected, collected and outstanding from the rows on screen', () => {
    expect(totalsFromRows(rows)).toEqual({
      expectedFils: 12000,
      collectedFils: 8000,
      outstandingFils: 4000,
    });
  });

  it('leaves a credit out of the collected total', () => {
    // 12.2 rule 3: unpaid amounts are not revenue, and a credit is not cash.
    const credited = totalsFromRows([rows[2] as ReviewRow]);
    expect(credited.collectedFils).toBe(0);
  });

  it('takes the cost and the credit value from the server, and 12.3’s two profits', () => {
    const summary: MoneySummary = {
      expectedFils: 12000 as Fils,
      collectedFils: 8000 as Fils,
      creditRevenueFils: 5000 as Fils,
      outstandingFils: 4000 as Fils,
      costFils: 31250 as Fils,
      profitFils: 0 as Fils,
      profitIfCollectedFils: 0 as Fils,
      attendeeCount: 4,
      unsettledCount: 4,
    };

    const merged = mergeSummary(summary, rows);

    expect(merged.creditRevenueFils).toBe(5000);
    expect(merged.costFils).toBe(31250);
    // 12.3: profit = (cash + cliq + credit revenue) − session_cost
    expect(merged.profitFils).toBe(8000 + 5000 - 31250);
    expect(merged.profitIfCollectedFils).toBe(8000 + 4000 + 5000 - 31250);
    expect(merged.attendeeCount).toBe(4);
  });

  it('still renders the money it knows when the summary has not loaded', () => {
    const merged = mergeSummary(undefined, rows);
    expect(merged).toMatchObject({ expectedFils: 12000, collectedFils: 8000, costFils: 0 });
  });

  it('counts the rows still waiting to be reviewed', () => {
    const merged = mergeSummary(undefined, [
      row({ bookingId: 'a', isSettled: true }),
      row({ bookingId: 'b', isSettled: false }),
    ]);
    expect(merged.unsettledCount).toBe(1);
  });
});
