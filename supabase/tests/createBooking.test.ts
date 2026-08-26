/**
 * create_booking, against the local stack. BUILD-SPEC 8.2, 9.1, 10.1.
 *
 * Section 9.1 is a nine row table with an exact error code on every row, and
 * every one of those rows has a test here that asserts that exact code — not a
 * failure, not a message, the code. The client turns codes into copy
 * (features/bookings/errors.ts) and it can only do that if the server keeps
 * raising the same words.
 *
 * A raised exception reaches PostgREST as a P0001 whose message is the raised
 * text, so `error.message` is what the code is read from.
 */
import { nowInAmman } from '../../src/lib/time';
import { anonClient, serviceClient, signIn, type Client } from './helpers/clients';
import { SESSIONS, USERS } from './helpers/fixtures';
import { confirmEmail, unconfirmEmail } from './helpers/sql';
import {
  bookingRow,
  cleanupFixtures,
  createSession,
  fillSession,
  grantSubscription,
  remainingCredits,
  seededPlayer,
} from './helpers/bookingFixtures';

const PLAYER = seededPlayer(30);
const OTHER = seededPlayer(31);

let player: Client;

async function book(
  client: Client,
  sessionId: string,
  method: 'cash' | 'cliq' | 'credit' | 'free' = 'cash',
): Promise<{ bookingId: string | null; code: string | null }> {
  const { data, error } = await client.rpc('create_booking', {
    p_session_id: sessionId,
    p_payment_method: method,
  });

  return { bookingId: data ?? null, code: error === null ? null : error.message.trim() };
}

beforeAll(async () => {
  player = await signIn(PLAYER.email);
});

afterAll(async () => {
  await cleanupFixtures();
});

describe('the happy path', () => {
  it('creates one confirmed cash booking at the session price', async () => {
    const session = await createSession({ startsInMinutes: 26 * 60 });
    const { bookingId, code } = await book(player, session.id);

    expect(code).toBeNull();
    expect(bookingId).not.toBeNull();

    // 10.1: cash is confirmed and unpaid, at the resolved price. A7: that
    // price is a snapshot taken now.
    const row = await bookingRow(bookingId as string);
    expect(row).toMatchObject({
      status: 'confirmed',
      payment_method: 'cash',
      payment_status: 'unpaid',
      expected_fils: 6000,
      paid_fils: 0,
      source: 'self',
      attendee_kind: 'player',
    });
  });

  it('takes one credit and expects no money when he pays by credit', async () => {
    const session = await createSession({ startsInMinutes: 27 * 60 });
    const subscription = await grantSubscription(OTHER.id, 8);
    const other = await signIn(OTHER.email);

    const { bookingId, code } = await book(other, session.id, 'credit');
    expect(code).toBeNull();

    // 10.1: credit is confirmed, paid, expected 0, one transaction of -1.
    const row = await bookingRow(bookingId as string);
    expect(row).toMatchObject({
      payment_method: 'credit',
      payment_status: 'paid',
      expected_fils: 0,
    });
    expect(row.credit_txn_id).not.toBeNull();
    expect(await remainingCredits(subscription)).toBe(7);
  });

  it('applies the player’s own rate rather than the poster price', async () => {
    // Seeded player005 has a custom rate of zero on both types. D41, A5.
    const zeroRate = seededPlayer(5);
    const session = await createSession({ startsInMinutes: 28 * 60 });
    const client = await signIn(zeroRate.email);

    const { bookingId, code } = await book(client, session.id);
    expect(code).toBeNull();

    const row = await bookingRow(bookingId as string);
    expect(row.expected_fils).toBe(0);
  });

  it('takes him off the waiting list for that session', async () => {
    const session = await createSession({ startsInMinutes: 29 * 60, courtCount: 1 });
    await fillSession(session.id, 4);

    const waiting = seededPlayer(32);
    const client = await signIn(waiting.email);
    const { error: joinError } = await client.rpc('join_waitlist', { p_session_id: session.id });
    expect(joinError).toBeNull();

    // A spot opens.
    const admin = serviceClient();
    const { data: filler } = await admin
      .from('bookings')
      .select('id')
      .eq('session_id', session.id)
      .limit(1)
      .single();
    await admin
      .from('bookings')
      .update({ status: 'cancelled_by_admin' })
      .eq('id', filler?.id ?? '');

    const { code } = await book(client, session.id);
    expect(code).toBeNull();

    const { data: entries } = await admin
      .from('waitlist_entries')
      .select('id')
      .eq('session_id', session.id)
      .eq('player_id', waiting.id);
    expect(entries).toEqual([]);
  });
});

/**
 * Section 9.1, row by row. The order of the table is itself a rule — "evaluate
 * in this order and return the first failure" — so each fixture below is
 * arranged to fail on exactly one rule.
 */
describe('section 9.1, the rejection table', () => {
  it('1. session does not exist -> session_not_found', async () => {
    const { code } = await book(player, '00000000-0000-4000-8000-000000000000');
    expect(code).toBe('session_not_found');
  });

  it('2. session is cancelled -> session_not_open', async () => {
    const { code } = await book(player, SESSIONS.cancelled);
    expect(code).toBe('session_not_open');
  });

  it('2. session has already been reviewed -> session_not_open', async () => {
    const session = await createSession({ startsInMinutes: 30 * 60, status: 'pending_review' });
    const { code } = await book(player, session.id);
    expect(code).toBe('session_not_open');
  });

  it('3. session is beyond the 5 day window -> outside_booking_window', async () => {
    // D20: a rolling 5 days from today, inclusive of today, so today + 5 is out.
    const session = await createSession({ startsInMinutes: 5 * 24 * 60 + 60 });
    const { code } = await book(player, session.id);
    expect(code).toBe('outside_booking_window');
  });

  it('3. the fifth day itself is still bookable', async () => {
    const session = await createSession({ startsInMinutes: 4 * 24 * 60 });
    const { code } = await book(player, session.id);
    expect(code).toBeNull();
  });

  it('4. inside the last hour -> booking_window_closed', async () => {
    // D21: reservations close 1 hour before start.
    const session = await createSession({ startsInMinutes: 59 });
    const { code } = await book(player, session.id);
    expect(code).toBe('booking_window_closed');
  });

  it('4. sixty-one minutes out is still open', async () => {
    const session = await createSession({ startsInMinutes: 61 });
    const { code } = await book(player, session.id);
    expect(code).toBeNull();
  });

  it('5. email not confirmed -> email_not_confirmed', async () => {
    // D12 and A10: confirmation gates booking. C4 records why an unconfirmed
    // account cannot sign in at all, which is why the confirmation is
    // withdrawn after the session was issued rather than before.
    const subject = seededPlayer(33);
    const client = await signIn(subject.email);
    const session = await createSession({ startsInMinutes: 31 * 60 });

    unconfirmEmail(subject.id);
    try {
      const { code } = await book(client, session.id);
      expect(code).toBe('email_not_confirmed');
    } finally {
      confirmEmail(subject.id);
    }
  });

  it('6. account deleted -> account_deleted', async () => {
    // A1: deletion anonymises rather than removes, so the row survives with
    // deleted_at set and this is the flag that says what it is.
    const subject = seededPlayer(34);
    const client = await signIn(subject.email);
    const session = await createSession({ startsInMinutes: 32 * 60 });
    const admin = serviceClient();

    await admin
      .from('profiles')
      .update({ deleted_at: nowInAmman().toISOString() })
      .eq('id', subject.id);

    try {
      const { code } = await book(client, session.id);
      expect(code).toBe('account_deleted');
    } finally {
      await admin.from('profiles').update({ deleted_at: null }).eq('id', subject.id);
    }
  });

  it('7. already booked -> already_booked', async () => {
    const session = await createSession({ startsInMinutes: 33 * 60 });
    const first = await book(player, session.id);
    expect(first.code).toBeNull();

    const { code } = await book(player, session.id);
    expect(code).toBe('already_booked');
  });

  it('7. already booked beats session_full when both are true', async () => {
    // 9.1 states an order and this is where it bites: a player rebooking a
    // session he is already in should be told he is already in it, not that it
    // is full. Section 8.2's example code checks these the other way round.
    const session = await createSession({ startsInMinutes: 34 * 60, courtCount: 1 });
    const subject = seededPlayer(35);
    const client = await signIn(subject.email);

    const first = await book(client, session.id);
    expect(first.code).toBeNull();
    await fillSession(session.id, 3);

    const { code } = await book(client, session.id);
    expect(code).toBe('already_booked');
  });

  it('8. session is full -> session_full', async () => {
    // D30: capacity is hard. Capacity is courts × 4, so one court is four.
    const session = await createSession({ startsInMinutes: 35 * 60, courtCount: 1 });
    await fillSession(session.id, 4);

    const { code } = await book(player, session.id);
    expect(code).toBe('session_full');
  });

  it('9. paying by credit with no usable subscription -> no_credits_available', async () => {
    const session = await createSession({ startsInMinutes: 36 * 60 });
    const subject = seededPlayer(36);
    const client = await signIn(subject.email);

    const { code } = await book(client, session.id, 'credit');
    expect(code).toBe('no_credits_available');
  });

  it('9. an expired subscription is not a usable one', async () => {
    // 11.5: expiry voids unused credits. pick_subscription only ever returns a
    // live subscription with a positive balance.
    const subject = seededPlayer(37);
    await grantSubscription(subject.id, 8, -1);

    const session = await createSession({ startsInMinutes: 37 * 60 });
    const client = await signIn(subject.email);

    const { code } = await book(client, session.id, 'credit');
    expect(code).toBe('no_credits_available');
  });
});

/**
 * The two methods a player may not choose for himself. A37.
 */
describe('payment methods a player cannot pick', () => {
  it('refuses free, which is how staff record a guest or a coach slot', async () => {
    const session = await createSession({ startsInMinutes: 38 * 60 });
    const { code } = await book(player, session.id, 'free');
    expect(code).toBe('payment_method_not_allowed');
  });

  it('refuses CliQ, which has to arrive with its proof', async () => {
    // 10.1: "A booking must never exist with payment_method = 'cliq' and no
    // proof row." This entry point cannot attach one, so CliQ goes through
    // create_cliq_booking instead — see supabase/tests/cliqBooking.test.ts.
    const session = await createSession({ startsInMinutes: 39 * 60 });
    const { code } = await book(player, session.id, 'cliq');
    expect(code).toBe('cliq_requires_proof');
  });
});

describe('who may call it at all', () => {
  it('refuses an anonymous caller', async () => {
    const { error } = await anonClient().rpc('create_booking', {
      p_session_id: SESSIONS.open,
      p_payment_method: 'cash',
    });

    expect(error).not.toBeNull();
  });

  it('leaves the seeded open session untouched by all of the above', async () => {
    const { count } = await serviceClient()
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', SESSIONS.open)
      .eq('status', 'confirmed');

    expect(count).toBe(6);
  });
});

describe('a player’s own booking, seen through RLS afterwards', () => {
  it('is readable by him and by nobody else', async () => {
    const session = await createSession({ startsInMinutes: 40 * 60 });
    const { bookingId } = await book(player, session.id);

    const mine = await player
      .from('bookings')
      .select('id')
      .eq('id', bookingId as string);
    expect(mine.data).toHaveLength(1);

    const stranger = await signIn(USERS.outsider.email);
    const theirs = await stranger
      .from('bookings')
      .select('id')
      .eq('id', bookingId as string);
    expect(theirs.data).toEqual([]);
  });
});
