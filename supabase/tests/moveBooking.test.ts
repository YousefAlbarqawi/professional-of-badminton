/**
 * `admin_move_booking`. BUILD-SPEC 15.2's "Move to another session", closed in
 * OPEN-ITEMS.md's phase 10 update — migration 0037 records the reasoning for
 * each of the three questions it left open. This file is the proof of them:
 *
 *   price does not re-resolve   `expected_fils` and `paid_fils` carry over
 *   a credit follows him        same `credit_txn_id`, no new ledger row
 *   target capacity is hard     the same `session_full` a fresh booking hits
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';
import {
  bookingRow,
  cleanupFixtures,
  createBookingRow,
  createSession,
  fillSession,
  grantSubscription,
  remainingCredits,
  seededPlayer,
} from './helpers/bookingFixtures';

// Section 22 seeds exactly 40 players, 1 to 40, with 1 and 4 to 10 carrying
// fixtures (subscriptions, custom rates) other suites depend on — 39 and 40
// are two plain ones.
const PLAYER = seededPlayer(39);
const OTHER = seededPlayer(40);

let player: Client;
let other: Client;
let coach: Client;
let admin: Client;

async function move(
  client: Client,
  bookingId: string,
  targetSessionId: string,
): Promise<{ newId: string | null; error: string | null }> {
  const { data, error } = await client.rpc('admin_move_booking', {
    p_booking_id: bookingId,
    p_target_session_id: targetSessionId,
  });
  return { newId: error === null ? data : null, error: error === null ? null : error.message.trim() };
}

beforeAll(async () => {
  [player, other, coach, admin] = await Promise.all([
    signIn(PLAYER.email),
    signIn(OTHER.email),
    signIn(USERS.coach.email),
    signIn(USERS.admin.email),
  ]);
}, 60000);

afterAll(async () => {
  await cleanupFixtures();
});

describe('authorization', () => {
  it('is refused to a player', async () => {
    const from = await createSession({ startsInMinutes: 20 * 60 });
    const to = await createSession({ startsInMinutes: 21 * 60 });
    const bookingId = await createBookingRow({ sessionId: from.id, playerId: PLAYER.id });

    const result = await move(player, bookingId, to.id);
    expect(result.error).toBe('not_authorized');
    expect((await bookingRow(bookingId)).status).toBe('confirmed');
  });

  it('is available to an admin, not only to the coach', async () => {
    const from = await createSession({ startsInMinutes: 22 * 60 });
    const to = await createSession({ startsInMinutes: 23 * 60 });
    const bookingId = await createBookingRow({ sessionId: from.id, playerId: PLAYER.id });

    const result = await move(admin, bookingId, to.id);
    expect(result.error).toBeNull();
  });
});

describe('what moves and what does not', () => {
  it('cancels the old booking and opens an equivalent one at the target', async () => {
    const from = await createSession({ startsInMinutes: 24 * 60, priceFils: 6000 });
    const to = await createSession({ startsInMinutes: 25 * 60, priceFils: 8000 });
    const bookingId = await createBookingRow({
      sessionId: from.id,
      playerId: PLAYER.id,
      method: 'cash',
      expectedFils: 6000,
    });
    await serviceClient().from('bookings').update({ paid_fils: 6000, payment_status: 'paid' }).eq('id', bookingId);

    const result = await move(coach, bookingId, to.id);
    expect(result.error).toBeNull();
    expect(result.newId).not.toBeNull();

    const oldRow = await bookingRow(bookingId);
    expect(oldRow.status).toBe('cancelled_by_admin');

    // The price does not re-resolve to the target's 8000: it carries over
    // unchanged, exactly as migration 0037 documents.
    const newRow = await bookingRow(result.newId as string);
    expect(newRow.status).toBe('confirmed');
    expect(newRow.expected_fils).toBe(6000);
    expect(newRow.paid_fils).toBe(6000);
    expect(newRow.payment_method).toBe('cash');
    expect(newRow.payment_status).toBe('paid');
    expect(newRow.source).toBe('admin_added');
  });

  it('carries the same credit transaction rather than refunding and re-spending', async () => {
    const subscription = await grantSubscription(PLAYER.id, 8);
    const from = await createSession({ startsInMinutes: 26 * 60 });
    const to = await createSession({ startsInMinutes: 27 * 60 });
    const bookingId = await createBookingRow({
      sessionId: from.id,
      playerId: PLAYER.id,
      method: 'credit',
      subscriptionId: subscription,
    });

    expect(await remainingCredits(subscription)).toBe(7);

    const result = await move(coach, bookingId, to.id);
    expect(result.error).toBeNull();

    // Still down exactly one credit — not refunded, not spent a second time.
    expect(await remainingCredits(subscription)).toBe(7);

    const oldRow = await bookingRow(bookingId);
    const newRow = await bookingRow(result.newId as string);
    expect(newRow.payment_method).toBe('credit');
    expect(newRow.credit_txn_id).not.toBeNull();
    expect(newRow.credit_txn_id).toBe(oldRow.credit_txn_id);

    // Removing the moved booking still finds its way back to the same
    // subscription, because the credit_txn_id it carries is the original one.
    const { error: removeError } = await coach.rpc('admin_remove_booking', {
      p_booking_id: result.newId as string,
      p_return_credit: true,
    });
    expect(removeError).toBeNull();
    expect(await remainingCredits(subscription)).toBe(8);
  });

  it('frees the spot at the session he left', async () => {
    const from = await createSession({ startsInMinutes: 28 * 60, courtCount: 1 });
    const to = await createSession({ startsInMinutes: 29 * 60 });
    const bookingId = await createBookingRow({ sessionId: from.id, playerId: PLAYER.id });
    await fillSession(from.id, 3);

    const beforeMove = await other.rpc('create_booking', {
      p_session_id: from.id,
      p_payment_method: 'cash',
    });
    expect(beforeMove.error?.message.trim()).toBe('session_full');

    const result = await move(coach, bookingId, to.id);
    expect(result.error).toBeNull();

    const afterMove = await other.rpc('create_booking', {
      p_session_id: from.id,
      p_payment_method: 'cash',
    });
    expect(afterMove.error).toBeNull();
  });
});

describe('refusals', () => {
  it('refuses the same session as its own target -> invalid_target_session', async () => {
    const session = await createSession({ startsInMinutes: 30 * 60 });
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: PLAYER.id });

    const result = await move(coach, bookingId, session.id);
    expect(result.error).toBe('invalid_target_session');
  });

  it('refuses a full target -> session_full', async () => {
    const from = await createSession({ startsInMinutes: 31 * 60 });
    const to = await createSession({ startsInMinutes: 32 * 60, courtCount: 1 });
    await fillSession(to.id, 4);
    const bookingId = await createBookingRow({ sessionId: from.id, playerId: PLAYER.id });

    const result = await move(coach, bookingId, to.id);
    expect(result.error).toBe('session_full');
    expect((await bookingRow(bookingId)).status).toBe('confirmed');
  });

  it('refuses when he is already booked at the target -> already_booked', async () => {
    const from = await createSession({ startsInMinutes: 33 * 60 });
    const to = await createSession({ startsInMinutes: 34 * 60 });
    const bookingId = await createBookingRow({ sessionId: from.id, playerId: PLAYER.id });
    await createBookingRow({ sessionId: to.id, playerId: PLAYER.id });

    const result = await move(coach, bookingId, to.id);
    expect(result.error).toBe('already_booked');
  });

  it('refuses a guest booking -> not_a_player_booking', async () => {
    const from = await createSession({ startsInMinutes: 35 * 60 });
    const to = await createSession({ startsInMinutes: 36 * 60 });
    await fillSession(from.id, 1);
    const { data } = await serviceClient()
      .from('bookings')
      .select('id')
      .eq('session_id', from.id)
      .single();

    const result = await move(coach, (data as { id: string }).id, to.id);
    expect(result.error).toBe('not_a_player_booking');
  });

  it('refuses once the source session is locked -> session_locked', async () => {
    const locked = await createSession({ startsInMinutes: -8 * 24 * 60, status: 'locked' });
    const to = await createSession({ startsInMinutes: 37 * 60 });
    const bookingId = await createBookingRow({ sessionId: locked.id, playerId: OTHER.id });

    const result = await move(coach, bookingId, to.id);
    expect(result.error).toBe('session_locked');
  });

  it('refuses a locked target -> session_locked', async () => {
    const from = await createSession({ startsInMinutes: 38 * 60 });
    const lockedTarget = await createSession({ startsInMinutes: -9 * 24 * 60, status: 'locked' });
    const bookingId = await createBookingRow({ sessionId: from.id, playerId: OTHER.id });

    const result = await move(coach, bookingId, lockedTarget.id);
    expect(result.error).toBe('session_locked');
  });
});
