/**
 * Cancelling, from both sides. BUILD-SPEC 8.3, 9.2, 9.3, D23 to D26.
 *
 * The boundary is the point of this file. D23 gives the player until three
 * hours before start and D24 gives him nothing after it, so the sessions below
 * are placed at 3h01m and 2h59m and the clock is left alone. 5.1 makes the
 * server the authority on time; a test that moved the clock would be testing
 * something else.
 *
 * 9.3 is the other half: what happens to money. Nothing happens to cash,
 * nothing happens to CliQ inside the app, and a credit comes back only when
 * the cancellation is outside the window — or when the coach says so.
 * **No cancellation ever writes a balance entry.**
 */
import { addDays } from 'date-fns';

import { ammanDayKey, nowInAmman } from '../../src/lib/time';
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

const PLAYER = seededPlayer(28);
const OTHER = seededPlayer(29);

let player: Client;
let other: Client;
let coach: Client;
let admin: Client;

async function cancel(client: Client, bookingId: string): Promise<string | null> {
  const { error } = await client.rpc('cancel_own_booking', { p_booking_id: bookingId });
  return error === null ? null : error.message.trim();
}

async function balanceEntriesFor(bookingId: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from('balance_entries')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId);

  if (error) throw new Error(error.message);
  return count ?? 0;
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

/**
 * D23 and D24, tested at 2h59m and 3h01m before start, which is what 19.1 asks
 * for in as many words.
 */
describe('the three hour boundary', () => {
  it('lets him cancel three hours and one minute before start', async () => {
    const session = await createSession({ startsInMinutes: 181 });
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: PLAYER.id });

    expect(await cancel(player, bookingId)).toBeNull();

    const row = await bookingRow(bookingId);
    expect(row.status).toBe('cancelled_by_player');
  });

  it('refuses two hours and fifty-nine minutes before start', async () => {
    const session = await createSession({ startsInMinutes: 179 });
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: PLAYER.id });

    expect(await cancel(player, bookingId)).toBe('cancellation_window_closed');

    const row = await bookingRow(bookingId);
    expect(row.status).toBe('confirmed');
  });

  it('refuses once the session has started', async () => {
    const session = await createSession({ startsInMinutes: -10, status: 'in_progress' });
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: PLAYER.id });

    expect(await cancel(player, bookingId)).toBe('cancellation_window_closed');
  });
});

describe('section 9.2, the other two rules', () => {
  it('refuses somebody else’s booking -> not_your_booking', async () => {
    const session = await createSession({ startsInMinutes: 10 * 60 });
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: PLAYER.id });

    expect(await cancel(other, bookingId)).toBe('not_your_booking');

    const row = await bookingRow(bookingId);
    expect(row.status).toBe('confirmed');
  });

  it('refuses a second cancellation -> already_cancelled', async () => {
    const session = await createSession({ startsInMinutes: 11 * 60 });
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: PLAYER.id });

    expect(await cancel(player, bookingId)).toBeNull();
    expect(await cancel(player, bookingId)).toBe('already_cancelled');
  });
});

/**
 * 9.3. The table has three rows and two of them are "the app records nothing".
 */
describe('what happens to the money', () => {
  it('returns the credit when he cancels more than three hours out', async () => {
    // D25 and A2: it goes back to the subscription it came from.
    const subscription = await grantSubscription(PLAYER.id, 8);
    const session = await createSession({ startsInMinutes: 8 * 60 });
    const bookingId = await createBookingRow({
      sessionId: session.id,
      playerId: PLAYER.id,
      method: 'credit',
      subscriptionId: subscription,
    });

    expect(await remainingCredits(subscription)).toBe(7);
    expect(await cancel(player, bookingId)).toBeNull();
    expect(await remainingCredits(subscription)).toBe(8);

    const { data } = await serviceClient()
      .from('credit_transactions')
      .select('delta, reason')
      .eq('booking_id', bookingId)
      .eq('delta', 1)
      .single();

    expect(data?.reason).toBe('booking_refund');
  });

  it('returns it even when the subscription has since expired', async () => {
    // A2. The credit goes home and the nightly expiry job voids it there like
    // any other, rather than being moved to a subscription it never came from.
    const subject = seededPlayer(38);
    const client = await signIn(subject.email);
    const subscription = await grantSubscription(subject.id, 8);
    const session = await createSession({ startsInMinutes: 9 * 60 });
    const bookingId = await createBookingRow({
      sessionId: session.id,
      playerId: subject.id,
      method: 'credit',
      subscriptionId: subscription,
    });

    await serviceClient()
      .from('player_subscriptions')
      .update({ expires_on: ammanDayKey(addDays(nowInAmman(), -1)) })
      .eq('id', subscription);

    expect(await cancel(client, bookingId)).toBeNull();
    expect(await remainingCredits(subscription)).toBe(8);
  });

  it('keeps the credit when the coach removes him inside three hours', async () => {
    // D26: cancellation inside 3 hours consumes the credit. The coach may
    // override, and 8.3 makes that an explicit argument rather than a rule.
    const subscription = await grantSubscription(OTHER.id, 8);
    const session = await createSession({ startsInMinutes: 100 });
    const bookingId = await createBookingRow({
      sessionId: session.id,
      playerId: OTHER.id,
      method: 'credit',
      subscriptionId: subscription,
    });

    const { error } = await coach.rpc('admin_remove_booking', { p_booking_id: bookingId });
    expect(error).toBeNull();

    expect(await remainingCredits(subscription)).toBe(7);
    expect((await bookingRow(bookingId)).status).toBe('cancelled_by_admin');
  });

  it('lets the coach override and hand the credit back anyway', async () => {
    const subscription = await grantSubscription(OTHER.id, 8);
    const session = await createSession({ startsInMinutes: 100 });
    const bookingId = await createBookingRow({
      sessionId: session.id,
      playerId: OTHER.id,
      method: 'credit',
      subscriptionId: subscription,
    });

    const { error } = await coach.rpc('admin_remove_booking', {
      p_booking_id: bookingId,
      p_return_credit: true,
    });
    expect(error).toBeNull();
    expect(await remainingCredits(subscription)).toBe(8);
  });

  it('returns it by default when the coach removes him well before start', async () => {
    const subscription = await grantSubscription(OTHER.id, 8);
    const session = await createSession({ startsInMinutes: 12 * 60 });
    const bookingId = await createBookingRow({
      sessionId: session.id,
      playerId: OTHER.id,
      method: 'credit',
      subscriptionId: subscription,
    });

    const { error } = await coach.rpc('admin_remove_booking', { p_booking_id: bookingId });
    expect(error).toBeNull();
    expect(await remainingCredits(subscription)).toBe(8);
  });

  it('writes no balance entry, whichever side of the window it falls', async () => {
    // 9.3: "The app never creates a balance entry from a cancellation. A
    // player who cancels late owes nothing in the system."
    const early = await createSession({ startsInMinutes: 13 * 60 });
    const earlyBooking = await createBookingRow({ sessionId: early.id, playerId: PLAYER.id });
    await cancel(player, earlyBooking);

    const late = await createSession({ startsInMinutes: 90 });
    const lateBooking = await createBookingRow({ sessionId: late.id, playerId: PLAYER.id });
    await coach.rpc('admin_remove_booking', { p_booking_id: lateBooking });

    expect(await balanceEntriesFor(earlyBooking)).toBe(0);
    expect(await balanceEntriesFor(lateBooking)).toBe(0);
  });

  it('records nothing at all for a CliQ booking', async () => {
    // 9.3, CliQ column: "Booking cancelled. The app records nothing. Coach
    // refunds outside." D25.
    const session = await createSession({ startsInMinutes: 14 * 60 });
    const bookingId = await createBookingRow({
      sessionId: session.id,
      playerId: PLAYER.id,
      method: 'cliq',
    });

    expect(await cancel(player, bookingId)).toBeNull();

    const { data } = await serviceClient()
      .from('credit_transactions')
      .select('id')
      .eq('booking_id', bookingId);

    expect(data).toEqual([]);
    expect(await balanceEntriesFor(bookingId)).toBe(0);
  });
});

describe('admin_remove_booking', () => {
  it('is refused to a player', async () => {
    const session = await createSession({ startsInMinutes: 15 * 60 });
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: PLAYER.id });

    const { error } = await player.rpc('admin_remove_booking', { p_booking_id: bookingId });
    expect(error?.message.trim()).toBe('not_authorized');
    expect((await bookingRow(bookingId)).status).toBe('confirmed');
  });

  it('is available to an admin, not only to the coach', async () => {
    // D16: an admin can do everything the coach can do except view reports.
    const session = await createSession({ startsInMinutes: 16 * 60 });
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: PLAYER.id });

    const { error } = await admin.rpc('admin_remove_booking', { p_booking_id: bookingId });
    expect(error).toBeNull();
    expect((await bookingRow(bookingId)).status).toBe('cancelled_by_admin');
  });

  it('works during the session itself, when only the coach can remove anybody', async () => {
    // D22 and D24.
    const session = await createSession({ startsInMinutes: -20, status: 'in_progress' });
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: PLAYER.id });

    const { error } = await coach.rpc('admin_remove_booking', { p_booking_id: bookingId });
    expect(error).toBeNull();
  });

  it('works during the review window and refuses after the lock', async () => {
    // D39: everything is editable for 7 days, then the session locks
    // permanently and there is no unlock.
    const inReview = await createSession({ startsInMinutes: -3 * 60, status: 'pending_review' });
    const reviewBooking = await createBookingRow({ sessionId: inReview.id, playerId: PLAYER.id });
    const { error: reviewError } = await coach.rpc('admin_remove_booking', {
      p_booking_id: reviewBooking,
    });
    expect(reviewError).toBeNull();

    const locked = await createSession({ startsInMinutes: -8 * 24 * 60, status: 'locked' });
    const lockedBooking = await createBookingRow({ sessionId: locked.id, playerId: PLAYER.id });
    const { error: lockedError } = await coach.rpc('admin_remove_booking', {
      p_booking_id: lockedBooking,
    });
    expect(lockedError?.message.trim()).toBe('session_locked');
  });

  it('frees the spot for somebody else', async () => {
    const session = await createSession({ startsInMinutes: 17 * 60, courtCount: 1 });
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: PLAYER.id });
    await fillSession(session.id, 3);

    const blocked = await other.rpc('create_booking', {
      p_session_id: session.id,
      p_payment_method: 'cash',
    });
    expect(blocked.error?.message.trim()).toBe('session_full');

    await coach.rpc('admin_remove_booking', { p_booking_id: bookingId });

    const allowed = await other.rpc('create_booking', {
      p_session_id: session.id,
      p_payment_method: 'cash',
    });
    expect(allowed.error).toBeNull();
  });
});
