/**
 * 15.9's and 15.10's form rules.
 *
 * Every one of these has a twin in migration 0029 and the server's is the one
 * that decides. These assertions are about the coach being told sooner, and
 * about the two never disagreeing on what is acceptable.
 */
import { adjustCreditsSchema, extendSubscriptionSchema, grantSubscriptionSchema } from '../schemas';

const validGrant = {
  packageId: 'pkg-1',
  startsOn: '2026-08-20',
  expiresOn: '2026-11-20',
  visits: '40',
  note: '',
};

describe('grantSubscriptionSchema', () => {
  it('accepts the 40 visit grant from 11.3', () => {
    expect(grantSubscriptionSchema.safeParse(validGrant).success).toBe(true);
  });

  it('accepts a note, which 11.2 step 5 makes optional', () => {
    const result = grantSubscriptionSchema.safeParse({
      ...validGrant,
      note: 'paid 80, 45 remaining',
    });
    expect(result.success).toBe(true);
  });

  it('refuses an expiry on or before the start date', () => {
    // The CHECK on player_subscriptions is `expires_on > starts_on`, and
    // grant_subscription raises `invalid_expiry`. Same rule, said earlier.
    for (const expiresOn of ['2026-08-20', '2026-08-19']) {
      const result = grantSubscriptionSchema.safeParse({ ...validGrant, expiresOn });
      expect(result.success).toBe(false);
    }
  });

  it('refuses a zero or negative visit count', () => {
    for (const visits of ['0', '-5', '', 'four', '2.5']) {
      expect(grantSubscriptionSchema.safeParse({ ...validGrant, visits }).success).toBe(false);
    }
  });

  it('refuses a date that is not yyyy-MM-dd', () => {
    expect(
      grantSubscriptionSchema.safeParse({ ...validGrant, startsOn: '20/08/2026' }).success,
    ).toBe(false);
  });

  it('names the key the screen shows, not an English sentence', () => {
    const result = grantSubscriptionSchema.safeParse({ ...validGrant, visits: '0' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('validation.visitCountInvalid');
    }
  });
});

describe('adjustCreditsSchema', () => {
  const validAdjust = { subscriptionId: 'sub-1', delta: '-13', note: 'used before the app' };

  it('accepts 11.3’s documented adjustment', () => {
    expect(adjustCreditsSchema.safeParse(validAdjust).success).toBe(true);
  });

  it('accepts a positive adjustment', () => {
    expect(adjustCreditsSchema.safeParse({ ...validAdjust, delta: '5' }).success).toBe(true);
  });

  it('requires the note', () => {
    // 11.3 and D56: a reason on every movement. `manual_adjustment` is the one
    // reason that does not explain itself.
    const result = adjustCreditsSchema.safeParse({ ...validAdjust, note: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('validation.noteRequired');
    }
  });

  it('refuses zero, which the delta column also forbids', () => {
    expect(adjustCreditsSchema.safeParse({ ...validAdjust, delta: '0' }).success).toBe(false);
  });

  it('refuses a fractional adjustment, because a credit is one visit', () => {
    // D52: one credit covers one session. There is no half a visit.
    expect(adjustCreditsSchema.safeParse({ ...validAdjust, delta: '-1.5' }).success).toBe(false);
  });
});

describe('extendSubscriptionSchema', () => {
  const schema = extendSubscriptionSchema('2026-11-20');

  it('accepts a later date', () => {
    expect(schema.safeParse({ expiresOn: '2026-12-20' }).success).toBe(true);
  });

  it('refuses the same date or an earlier one', () => {
    // 11.5 calls it extending. Moving the date backwards would shorten a
    // subscription, which is not an action the specification describes.
    expect(schema.safeParse({ expiresOn: '2026-11-20' }).success).toBe(false);
    expect(schema.safeParse({ expiresOn: '2026-11-19' }).success).toBe(false);
  });
});
