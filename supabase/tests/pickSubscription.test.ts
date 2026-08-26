/**
 * Which subscription a credit booking is taken from, and what happens to it
 * when the booking is cancelled.
 * BUILD-SPEC 8.2 (pick_subscription), 11.4, 9.3, D25, D26, D52.
 *
 * `pick_subscription` and the refund paths were written in phase 4 and are
 * exercised by createBooking.test.ts and cancelBooking.test.ts. What was never
 * asserted is the *order* — 11.4's "nearest expiry first" and 8.2's tie break
 * on `created_at` — which is phase 6's, because it is a rule about
 * subscriptions rather than about bookings. A player who holds two only ever
 * notices this when the wrong one dies with credits still in it.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';
import {
  bookingRow,
  cleanupFixtures,
  clearSubscriptions,
  createSession,
  grantSubscription,
  remainingCredits,
  seededPlayer,
} from './helpers/bookingFixtures';

const SUBJECT = seededPlayer(27);

let coach: Client;
let player: Client;

/** Which subscription the booking's credit transaction came out of. */
async function chargedSubscription(bookingId: string): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from('credit_transactions')
    .select('subscription_id')
    .eq('booking_id', bookingId)
    .eq('reason', 'booking')
    .single();
  if (error) return null;
  return data.subscription_id;
}

async function bookWithCredit(sessionId: string): Promise<string> {
  const { data, error } = await player.rpc('create_booking', {
    p_session_id: sessionId,
    p_payment_method: 'credit',
  });
  if (error) throw new Error(error.message);
  return data as string;
}

async function refundRows(bookingId: string): Promise<{ delta: number; reason: string }[]> {
  const { data, error } = await serviceClient()
    .from('credit_transactions')
    .select('delta, reason')
    .eq('booking_id', bookingId)
    .in('reason', ['booking_refund', 'session_cancelled']);
  if (error) throw new Error(error.message);
  return data;
}

beforeAll(async () => {
  [coach, player] = await Promise.all([signIn(USERS.coach.email), signIn(SUBJECT.email)]);
}, 60000);

// Every test here is about choosing between subscriptions, so the ones it did
// not grant must not exist. Without this the first test's five-day
// subscription stays the nearest expiry for the rest of the file.
beforeEach(async () => {
  await clearSubscriptions(SUBJECT.id);
});

afterAll(async () => {
  await cleanupFixtures();
  await clearSubscriptions(SUBJECT.id);
});

describe('pick_subscription, 11.4', () => {
  it('spends the credit closest to dying first', async () => {
    // "Multiple subscriptions: nearest expiry first." The one with more
    // credits and more time is deliberately not chosen.
    const far = await grantSubscription(SUBJECT.id, 20, 60);
    const near = await grantSubscription(SUBJECT.id, 8, 5);
    const session = await createSession({ startsInMinutes: 26 * 60 });

    const booking = await bookWithCredit(session.id);

    expect(await chargedSubscription(booking)).toBe(near);
    expect(await remainingCredits(near)).toBe(7);
    expect(await remainingCredits(far)).toBe(20);
  });

  it('breaks a tie on the older subscription', async () => {
    // 8.2 step 3: "Tie break on created_at ascending." Two subscriptions
    // expiring on the same day, and the one granted first is spent first.
    const older = await grantSubscription(SUBJECT.id, 8, 12);
    const newer = await grantSubscription(SUBJECT.id, 8, 12);
    const session = await createSession({ startsInMinutes: 27 * 60 });

    const booking = await bookWithCredit(session.id);

    expect(await chargedSubscription(booking)).toBe(older);
    expect(await remainingCredits(newer)).toBe(8);
  });

  it('skips an empty subscription and takes the next one out', async () => {
    // Step 1: remaining > 0. An exhausted subscription that has not yet
    // expired is still the nearest by date, and must be passed over.
    const empty = await grantSubscription(SUBJECT.id, 4, 3);
    await coach.rpc('adjust_credits', {
      p_subscription_id: empty,
      p_delta: -4,
      p_note: 'all four used before the app',
    });
    const live = await grantSubscription(SUBJECT.id, 8, 20);
    const session = await createSession({ startsInMinutes: 28 * 60 });

    const booking = await bookWithCredit(session.id);

    expect(await chargedSubscription(booking)).toBe(live);
  });

  it('skips an expired one, and one that has been voided', async () => {
    // D54: expiry voids unused credits, so neither is spendable however near
    // its date is.
    const expired = await grantSubscription(SUBJECT.id, 8, -2);
    const voided = await grantSubscription(SUBJECT.id, 8, 4);
    await serviceClient().from('player_subscriptions').update({ is_voided: true }).eq('id', voided);
    const live = await grantSubscription(SUBJECT.id, 8, 25);
    const session = await createSession({ startsInMinutes: 29 * 60 });

    const booking = await bookWithCredit(session.id);

    expect(await chargedSubscription(booking)).toBe(live);
    expect(await remainingCredits(expired)).toBe(8);
    expect(await remainingCredits(voided)).toBe(8);
  });

  it('charges one credit for an extended session, same as a standard one', async () => {
    // D52: "One credit covers one session, standard or extended alike." D53
    // keeps the cash difference out of the app entirely — no balance entry, no
    // second transaction, nothing.
    const sub = await grantSubscription(SUBJECT.id, 8, 15);
    const session = await createSession({
      startsInMinutes: 30 * 60,
      priceFils: 8000,
      durationMinutes: 150,
    });

    const booking = await bookWithCredit(session.id);

    expect(await remainingCredits(sub)).toBe(7);
    expect((await bookingRow(booking)).expected_fils).toBe(0);

    const { data: entries } = await serviceClient()
      .from('balance_entries')
      .select('id')
      .eq('booking_id', booking);
    expect(entries).toEqual([]);
  });
});

describe('9.3, what a cancellation does to the credit', () => {
  it('returns it outside three hours', async () => {
    // D25, and the credit goes back to the subscription it came from (A2).
    const sub = await grantSubscription(SUBJECT.id, 8, 20);
    const session = await createSession({ startsInMinutes: 4 * 60 });
    const booking = await bookWithCredit(session.id);

    expect(await remainingCredits(sub)).toBe(7);

    const { error } = await player.rpc('cancel_own_booking', { p_booking_id: booking });
    expect(error).toBeNull();

    expect(await remainingCredits(sub)).toBe(8);
    expect(await refundRows(booking)).toEqual([{ delta: 1, reason: 'booking_refund' }]);
  });

  it('does not return it inside three hours, when the coach removes him', async () => {
    // D26: the credit is consumed and not returned. D24 means the player
    // cannot do this himself at all — only the coach can remove him.
    // Two hours out is past the 3 hour cancellation cutoff (D24) and still
    // inside the 1 hour reservation window (D21), so he can book it and
    // cannot then get out of it himself.
    const sub = await grantSubscription(SUBJECT.id, 8, 20);
    const session = await createSession({ startsInMinutes: 2 * 60 });
    const booking = await bookWithCredit(session.id);

    expect(await remainingCredits(sub)).toBe(7);

    const { error } = await coach.rpc('admin_remove_booking', { p_booking_id: booking });
    expect(error).toBeNull();

    expect(await remainingCredits(sub)).toBe(7);
    expect(await refundRows(booking)).toEqual([]);
  });

  it('lets the coach override and hand it back anyway', async () => {
    // 8.3: "the caller may override either way, because the coach is allowed
    // to make exceptions."
    const sub = await grantSubscription(SUBJECT.id, 8, 20);
    const session = await createSession({ startsInMinutes: 2 * 60 });
    const booking = await bookWithCredit(session.id);

    expect(await remainingCredits(sub)).toBe(7);

    const { error } = await coach.rpc('admin_remove_booking', {
      p_booking_id: booking,
      p_return_credit: true,
    });
    expect(error).toBeNull();

    expect(await remainingCredits(sub)).toBe(8);
  });

  it('lets him withhold it outside three hours, which is the other override', async () => {
    const sub = await grantSubscription(SUBJECT.id, 8, 20);
    const session = await createSession({ startsInMinutes: 5 * 60 });
    const booking = await bookWithCredit(session.id);

    const { error } = await coach.rpc('admin_remove_booking', {
      p_booking_id: booking,
      p_return_credit: false,
    });
    expect(error).toBeNull();

    expect(await remainingCredits(sub)).toBe(7);
  });

  it('returns the credit to the subscription it came from, even after expiry. A2', async () => {
    const dying = await grantSubscription(SUBJECT.id, 8, 1);
    const session = await createSession({ startsInMinutes: 6 * 60 });
    const booking = await bookWithCredit(session.id);
    expect(await chargedSubscription(booking)).toBe(dying);

    // The subscription dies while he still holds the booking.
    await serviceClient()
      .from('player_subscriptions')
      .update({ expires_on: '2020-01-01', starts_on: '2019-01-01' })
      .eq('id', dying);

    const { error } = await player.rpc('cancel_own_booking', { p_booking_id: booking });
    expect(error).toBeNull();

    // It goes home rather than moving to a live subscription. The nightly job
    // then voids it there like any other credit.
    expect(await remainingCredits(dying)).toBe(8);
  });
});
