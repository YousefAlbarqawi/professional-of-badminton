/**
 * record_payment. BUILD-SPEC 8.5, 10.2, 10.3, D37, D38, D40, D41.
 *
 * Phase 5's stated definition of done lives in the first test below:
 *
 *   "a partial payment of 4 JD against 6 JD produces exactly one balance entry
 *    of 2 JD, editing it to 5 JD leaves exactly one entry of 1 JD, and every
 *    mutation is refused after the lock."
 *
 * The third clause is in sessionReview.test.ts, with the lock that causes it.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';
import {
  balanceEntriesFor,
  bookingRow,
  cleanupFixtures,
  createBookingRow,
  createSession,
  grantSubscription,
  seededPlayer,
} from './helpers/bookingFixtures';

const SUBJECT = seededPlayer(22);

let coach: Client;
let admin: Client;
let player: Client;

/** A session that has ended and is waiting to be reviewed. 5.5. */
async function reviewableSession(offsetMinutes = 0): Promise<{ id: string }> {
  return createSession({
    startsInMinutes: -(3 * 60) + offsetMinutes,
    status: 'pending_review',
  });
}

beforeAll(async () => {
  [coach, admin, player] = await Promise.all([
    signIn(USERS.coach.email),
    signIn(USERS.admin.email),
    signIn(SUBJECT.email),
  ]);
}, 60000);

afterAll(async () => {
  await cleanupFixtures();
});

describe('the balance entry is rewritten, never duplicated', () => {
  it('6 JD expected, 4 JD recorded, then 5 JD: one entry throughout', async () => {
    const session = await reviewableSession();
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    await coach.rpc('record_payment', { p_booking_id: booking, p_paid_fils: 4000 });

    let entries = await balanceEntriesFor(booking);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount_fils).toBe(2000);
    expect(await bookingRow(booking)).toMatchObject({
      payment_status: 'partial',
      paid_fils: 4000,
      expected_fils: 6000,
    });

    await coach.rpc('record_payment', { p_booking_id: booking, p_paid_fils: 5000 });

    entries = await balanceEntriesFor(booking);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount_fils).toBe(1000);
    expect((await bookingRow(booking)).paid_fils).toBe(5000);
  });

  it('leaves no entry at all once the whole amount is recorded', async () => {
    // The case an UPDATE could not express, which is why the rewrite is a
    // delete followed by a conditional insert.
    const session = await reviewableSession(1);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    await coach.rpc('record_payment', { p_booking_id: booking, p_paid_fils: 3000 });
    expect(await balanceEntriesFor(booking)).toHaveLength(1);

    await coach.rpc('record_payment', { p_booking_id: booking, p_paid_fils: 6000 });

    expect(await balanceEntriesFor(booking)).toHaveLength(0);
    expect((await bookingRow(booking)).payment_status).toBe('paid');
  });

  it('never touches a manual entry, which carries no booking', async () => {
    // 10.3: the coach adds entries from the player profile. Those are his, and
    // nothing in the review screen rewrites them.
    const session = await reviewableSession(2);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    const { data: manual } = await coach
      .from('balance_entries')
      .insert({ player_id: SUBJECT.id, amount_fils: 15000, note: 'Owed from last month' })
      .select('id')
      .single();

    await coach.rpc('record_payment', { p_booking_id: booking, p_paid_fils: 0 });
    await coach.rpc('record_payment', { p_booking_id: booking, p_paid_fils: 6000 });

    const { data: still } = await serviceClient()
      .from('balance_entries')
      .select('id, amount_fils')
      .eq('id', manual?.id ?? '')
      .maybeSingle();

    expect(still).toMatchObject({ amount_fils: 15000 });
    await serviceClient()
      .from('balance_entries')
      .delete()
      .eq('id', manual?.id ?? '');
  });
});

describe('8.5’s four outcomes', () => {
  it('paid_fils = expected_fils is paid, with no entry', async () => {
    const session = await reviewableSession(3);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    await coach.rpc('record_payment', { p_booking_id: booking, p_paid_fils: 6000 });

    expect((await bookingRow(booking)).payment_status).toBe('paid');
    expect(await balanceEntriesFor(booking)).toHaveLength(0);
  });

  it('paid_fils = 0 against a real price is unpaid, with an entry for all of it', async () => {
    const session = await reviewableSession(4);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 8000,
    });

    await coach.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 0,
      p_note: 'Said he would send it tomorrow',
    });

    expect((await bookingRow(booking)).payment_status).toBe('unpaid');
    const entries = await balanceEntriesFor(booking);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      amount_fils: 8000,
      note: 'Said he would send it tomorrow',
    });
  });

  it('expected_fils = 0 is waived, and never a balance entry', async () => {
    // D41: zero is a valid custom rate and an expected one. 12.2 rule 2: he
    // consumes a court slot and contributes no revenue.
    const session = await reviewableSession(5);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 0,
    });

    await coach.rpc('record_payment', { p_booking_id: booking, p_paid_fils: 0 });

    expect((await bookingRow(booking)).payment_status).toBe('waived');
    expect(await balanceEntriesFor(booking)).toHaveLength(0);
  });

  it('gives a guest his status and no balance entry, because there is nobody to bill', async () => {
    // D44, D46: a guest has no account and is not remembered. balance_entries
    // has nowhere to hang the debt, and inventing somewhere would be inventing
    // the guest history section 4 item 12 forbids.
    const session = await reviewableSession(6);
    const { data: booking } = await coach.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: 'Short by two',
      p_guest_tier: 'B',
      p_is_free: false,
    });

    await coach.rpc('record_payment', { p_booking_id: booking as string, p_paid_fils: 4000 });

    expect((await bookingRow(booking as string)).payment_status).toBe('partial');
    expect(await balanceEntriesFor(booking as string)).toHaveLength(0);
  });
});

describe('changing the method, 10.2', () => {
  it('moves a booking from CliQ to cash and keeps the price he booked at', async () => {
    // "In case the player said CliQ and turned up with cash." A7: the price
    // snapshot is not rewritten by a method change.
    const session = await reviewableSession(7);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      method: 'cliq',
      expectedFils: 6000,
    });

    await coach.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 6000,
      p_method: 'cash',
    });

    expect(await bookingRow(booking)).toMatchObject({
      payment_method: 'cash',
      payment_status: 'paid',
      expected_fils: 6000,
    });
  });

  it('waives the amount when the method becomes free', async () => {
    const session = await reviewableSession(8);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    await coach.rpc('record_payment', { p_booking_id: booking, p_paid_fils: 0 });
    expect(await balanceEntriesFor(booking)).toHaveLength(1);

    await coach.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 0,
      p_method: 'free',
    });

    expect(await bookingRow(booking)).toMatchObject({
      payment_method: 'free',
      payment_status: 'waived',
      expected_fils: 0,
    });
    expect(await balanceEntriesFor(booking)).toHaveLength(0);
  });

  it('refuses to move a booking off credit, which would strand its ledger row', async () => {
    // A47. The coach's route is 10.2's *Remove from session*, which returns the
    // credit, and then re-add.
    const session = await reviewableSession(9);
    const subscription = await grantSubscription(SUBJECT.id, 8);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      method: 'credit',
      subscriptionId: subscription,
    });

    const { error } = await coach.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 0,
      p_method: 'cash',
    });

    expect(error?.message).toBe('credit_change_not_supported');
  });

  it('refuses to move a booking onto credit, which would need a subscription chosen', async () => {
    const session = await reviewableSession(10);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    const { error } = await coach.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 0,
      p_method: 'credit',
    });

    expect(error?.message).toBe('credit_change_not_supported');
  });

  it('leaves a credit booking alone when the method is not being changed', async () => {
    const session = await reviewableSession(11);
    const subscription = await grantSubscription(SUBJECT.id, 8);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      method: 'credit',
      subscriptionId: subscription,
    });

    const { error } = await coach.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 0,
    });

    expect(error).toBeNull();
    expect((await bookingRow(booking)).payment_status).toBe('waived');
  });
});

describe('what it refuses', () => {
  it('refuses more than was expected', async () => {
    const session = await reviewableSession(12);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    const { error } = await coach.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 7000,
    });

    expect(error?.message).toBe('invalid_amount');
  });

  it('refuses a negative amount', async () => {
    const session = await reviewableSession(13);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    const { error } = await coach.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: -1000,
    });

    expect(error?.message).toBe('invalid_amount');
  });

  it('refuses a cancelled booking', async () => {
    // 9.3: "The app never creates a balance entry from a cancellation."
    const session = await reviewableSession(14);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });
    await coach.rpc('admin_remove_booking', { p_booking_id: booking });

    const { error } = await coach.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 0,
    });

    expect(error?.message).toBe('already_cancelled');
  });

  it('refuses a player, however he asks', async () => {
    const session = await reviewableSession(15);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    const { error } = await player.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 6000,
    });

    expect(error?.message).toBe('not_authorized');
    expect((await bookingRow(booking)).payment_status).toBe('unpaid');
  });
});

describe('who may take a payment', () => {
  it('lets an admin, who does everything the coach does except reports', async () => {
    // D16.
    const session = await reviewableSession(16);
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    const { error } = await admin.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 6000,
    });

    expect(error).toBeNull();
    expect((await bookingRow(booking)).payment_status).toBe('paid');
  });
});
