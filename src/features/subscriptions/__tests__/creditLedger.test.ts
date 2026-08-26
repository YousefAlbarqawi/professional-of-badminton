/**
 * The credit ledger rules. BUILD-SPEC 11.4, 11.5, 11.6, 14.13, D54, D56.
 *
 * The first describe block is the one that matters: the balance is the sum of
 * the ledger and there is no counter anywhere. Every other number on every
 * subscription screen is derived from it.
 */
import type { Fils } from '@/lib/money';

import {
  EXPIRY_WARNING_DAYS,
  addMonths,
  daysUntilExpiry,
  isExpired,
  isExpiringSoon,
  isUsable,
  ledgerHistory,
  reasonLabelKey,
  remainingCredits,
  splitSubscriptions,
} from '../creditLedger';
import type { CreditReason, CreditTransaction, Subscription } from '../types';

let txnCounter = 0;

function txn(delta: number, reason: CreditReason, createdAt: string): CreditTransaction {
  txnCounter += 1;
  return {
    id: `txn-${String(txnCounter).padStart(3, '0')}`,
    subscriptionId: 'sub-1',
    delta,
    reason,
    note: null,
    bookingId: null,
    createdAt,
  };
}

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    playerId: 'player-1',
    packageNameEn: '40 visits, 3 months',
    packageNameAr: '٤٠ زيارة',
    grantedVisits: 40,
    perVisitFils: 4000 as Fils,
    startsOn: '2026-08-01',
    expiresOn: '2026-11-01',
    isVoided: false,
    note: null,
    createdAt: '2026-08-01T09:00:00Z',
    transactions: [],
    ...overrides,
  };
}

describe('remainingCredits', () => {
  it('is the sum of the ledger and nothing else', () => {
    // 6.2 and D56. If this ever stops being a plain sum, a counter column has
    // been introduced somewhere and the specification has been broken.
    const sub = subscription({
      transactions: [
        txn(40, 'grant', '2026-08-01T09:00:00Z'),
        txn(-1, 'booking', '2026-08-03T18:00:00Z'),
        txn(1, 'booking_refund', '2026-08-03T19:00:00Z'),
        txn(-1, 'booking', '2026-08-05T18:00:00Z'),
      ],
    });

    expect(remainingCredits(sub)).toBe(39);
  });

  it('is zero on an empty ledger', () => {
    expect(remainingCredits(subscription())).toBe(0);
  });

  it('reads 27 after the documented migration flow', () => {
    // 11.3, verbatim: grant the full 40 visit package, then adjust by −13 with
    // the note "used before the app". This is the number the coach checks.
    const sub = subscription({
      transactions: [
        txn(40, 'grant', '2026-08-01T09:00:00Z'),
        { ...txn(-13, 'manual_adjustment', '2026-08-01T09:05:00Z'), note: 'used before the app' },
      ],
    });

    expect(remainingCredits(sub)).toBe(27);
  });

  it('is zero once the expiry job has zeroed it', () => {
    // 11.5: the job writes a transaction that brings the balance to exactly
    // zero, then voids. The history still says where the credits went.
    const sub = subscription({
      isVoided: true,
      transactions: [
        txn(8, 'grant', '2026-06-01T09:00:00Z'),
        txn(-3, 'booking', '2026-06-10T18:00:00Z'),
        txn(-5, 'expiry', '2026-07-02T00:20:00Z'),
      ],
    });

    expect(remainingCredits(sub)).toBe(0);
    expect(sub.transactions).toHaveLength(3);
  });
});

describe('isUsable', () => {
  const live = subscription({ transactions: [txn(5, 'grant', '2026-08-01T09:00:00Z')] });

  it('accepts a subscription expiring today', () => {
    // pick_subscription compares expires_on >= amman_today(), so a credit that
    // expires today is spendable all of today. The client must agree exactly.
    expect(isUsable({ ...live, expiresOn: '2026-09-15' }, '2026-09-15')).toBe(true);
  });

  it('refuses one that expired yesterday', () => {
    expect(isUsable({ ...live, expiresOn: '2026-09-14' }, '2026-09-15')).toBe(false);
  });

  it('refuses a voided subscription even with a positive ledger', () => {
    // A2 lets a refund land on an expired subscription. It is not spendable
    // there; the next run of the expiry job voids it again.
    expect(isUsable({ ...live, isVoided: true }, '2026-08-15')).toBe(false);
  });

  it('refuses an empty one', () => {
    const spent = subscription({
      transactions: [
        txn(1, 'grant', '2026-08-01T09:00:00Z'),
        txn(-1, 'booking', '2026-08-02T18:00:00Z'),
      ],
    });
    expect(isUsable(spent, '2026-08-15')).toBe(false);
  });
});

describe('expiry warnings', () => {
  it('counts whole days to the expiry date', () => {
    expect(daysUntilExpiry('2026-09-20', '2026-09-13')).toBe(7);
    expect(daysUntilExpiry('2026-09-13', '2026-09-13')).toBe(0);
    expect(daysUntilExpiry('2026-09-12', '2026-09-13')).toBe(-1);
  });

  it('warns inside the last seven days and not on the seventh', () => {
    // 11.6: "a warning chip when fewer than 7 days remain". Fewer than, so
    // exactly seven is not yet a warning.
    const sub = subscription({ transactions: [txn(4, 'grant', '2026-08-01T09:00:00Z')] });

    expect(isExpiringSoon({ ...sub, expiresOn: '2026-09-20' }, '2026-09-13')).toBe(false);
    expect(isExpiringSoon({ ...sub, expiresOn: '2026-09-19' }, '2026-09-13')).toBe(true);
    expect(isExpiringSoon({ ...sub, expiresOn: '2026-09-13' }, '2026-09-13')).toBe(true);
    expect(EXPIRY_WARNING_DAYS).toBe(7);
  });

  it('does not warn about a subscription that has already expired', () => {
    const sub = subscription({ expiresOn: '2026-09-12' });
    expect(isExpiringSoon(sub, '2026-09-13')).toBe(false);
  });
});

describe('isExpired', () => {
  it('is true when voided and true when the date has passed', () => {
    expect(isExpired(subscription({ isVoided: true, expiresOn: '2027-01-01' }), '2026-09-13')).toBe(
      true,
    );
    expect(isExpired(subscription({ expiresOn: '2026-09-12' }), '2026-09-13')).toBe(true);
  });

  it('leaves a live subscription with no credits left in the active section', () => {
    // He has used all eight visits. That is not the same thing as never having
    // had a subscription, and 14.13 must not present it as if it were.
    const spent = subscription({
      expiresOn: '2026-12-01',
      transactions: [
        txn(8, 'grant', '2026-08-01T09:00:00Z'),
        txn(-8, 'booking', '2026-08-20T18:00:00Z'),
      ],
    });
    expect(isExpired(spent, '2026-09-13')).toBe(false);
  });
});

describe('splitSubscriptions', () => {
  it('orders the active ones by nearest expiry, which is the spend order', () => {
    // 11.4 and pick_subscription: nearest expiry first. The top card is the
    // subscription the next booking comes out of.
    const far = subscription({
      id: 'far',
      expiresOn: '2026-12-01',
      transactions: [txn(10, 'grant', '2026-08-01T09:00:00Z')],
    });
    const near = subscription({
      id: 'near',
      expiresOn: '2026-09-20',
      transactions: [txn(3, 'grant', '2026-08-01T09:00:00Z')],
    });
    const dead = subscription({ id: 'dead', expiresOn: '2026-08-20', isVoided: true });

    const split = splitSubscriptions([far, near, dead], '2026-09-13');

    expect(split.active.map((s) => s.id)).toEqual(['near', 'far']);
    expect(split.expired.map((s) => s.id)).toEqual(['dead']);
    expect(split.totalRemaining).toBe(13);
  });

  it('breaks a tie on the older subscription, as pick_subscription does', () => {
    const older = subscription({
      id: 'older',
      expiresOn: '2026-10-01',
      createdAt: '2026-07-01T09:00:00Z',
      transactions: [txn(2, 'grant', '2026-07-01T09:00:00Z')],
    });
    const newer = subscription({
      id: 'newer',
      expiresOn: '2026-10-01',
      createdAt: '2026-08-01T09:00:00Z',
      transactions: [txn(2, 'grant', '2026-08-01T09:00:00Z')],
    });

    expect(splitSubscriptions([newer, older], '2026-09-13').active.map((s) => s.id)).toEqual([
      'older',
      'newer',
    ]);
  });

  it('counts only live subscriptions in the total', () => {
    // 11.6: "Total credits remaining across all active subscriptions." A
    // voided one sums to zero anyway, but the total must not depend on that.
    const dead = subscription({
      id: 'dead',
      isVoided: true,
      transactions: [txn(1, 'booking_refund', '2026-09-01T09:00:00Z')],
    });
    expect(splitSubscriptions([dead], '2026-09-13').totalRemaining).toBe(0);
  });
});

describe('ledgerHistory', () => {
  it('interleaves every subscription newest first', () => {
    const a = subscription({
      id: 'a',
      transactions: [
        txn(8, 'grant', '2026-08-01T09:00:00Z'),
        txn(-1, 'booking', '2026-08-10T18:00:00Z'),
      ],
    });
    const b = subscription({
      id: 'b',
      transactions: [txn(15, 'grant', '2026-08-05T09:00:00Z')],
    });

    expect(ledgerHistory([a, b]).map((entry) => entry.createdAt)).toEqual([
      '2026-08-10T18:00:00Z',
      '2026-08-05T09:00:00Z',
      '2026-08-01T09:00:00Z',
    ]);
  });

  it('includes an expired subscription, because that is where the expiry row is', () => {
    const dead = subscription({
      isVoided: true,
      transactions: [
        txn(8, 'grant', '2026-06-01T09:00:00Z'),
        txn(-8, 'expiry', '2026-07-02T00:20:00Z'),
      ],
    });

    expect(ledgerHistory([dead]).map((entry) => entry.reason)).toEqual(['expiry', 'grant']);
  });
});

describe('reasonLabelKey', () => {
  it('has a key for every reason in the enum', () => {
    // D56: a reason on every movement, which means a string for every reason.
    const reasons: CreditReason[] = [
      'grant',
      'booking',
      'booking_refund',
      'expiry',
      'manual_adjustment',
      'session_cancelled',
    ];

    for (const reason of reasons) {
      expect(reasonLabelKey(reason)).toMatch(/^subscriptions\./);
    }
  });
});

describe('addMonths', () => {
  it('adds calendar months, as 15.9 auto-fills the expiry', () => {
    expect(addMonths('2026-08-20', 3)).toBe('2026-11-20');
    expect(addMonths('2026-08-20', 1)).toBe('2026-09-20');
    expect(addMonths('2026-08-20', 2)).toBe('2026-10-20');
  });

  it('clamps to the end of a shorter month, as make_interval does', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('carries the year', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-31');
  });

  it('leaves an unparseable value alone rather than inventing a date', () => {
    expect(addMonths('', 1)).toBe('');
  });
});
