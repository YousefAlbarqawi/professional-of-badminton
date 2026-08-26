/**
 * Confirming a review, reopening it, and the 7 day lock.
 * BUILD-SPEC 5.5, 5.6, 8.5, 8.6, 10.2, 12.1, 12.2, 12.3, D37, D39.
 *
 * The last describe block is phase 5's third acceptance clause: "every
 * mutation is refused after the lock". It is asserted twice over — once
 * against a session the nightly job has already locked, and once against one
 * that is past its deadline and still says pending_review, because a cron job
 * that has not run yet must not be a window.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';
import { sql } from './helpers/sql';
import {
  balanceEntriesFor,
  bookingRow,
  cleanupFixtures,
  createBookingRow,
  createSession,
  grantSubscription,
  seededPlayer,
  sessionRow,
} from './helpers/bookingFixtures';

const SUBJECT = seededPlayer(23);
const OTHER = seededPlayer(24);

const DAY = 24 * 60;

let coach: Client;
let admin: Client;
let player: Client;

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

describe('confirm_session_review, 8.5 and 10.2', () => {
  it('settles every confirmed booking and moves the session to confirmed', async () => {
    const session = await createSession({ startsInMinutes: -180, status: 'pending_review' });
    const a = await createBookingRow({ sessionId: session.id, playerId: SUBJECT.id });
    const b = await createBookingRow({ sessionId: session.id, playerId: OTHER.id });

    const { error } = await coach.rpc('confirm_session_review', { p_session_id: session.id });
    expect(error).toBeNull();

    // 5.6: settled means the coach has reviewed this row's payment. It says
    // nothing about whether the person turned up — attendance is not tracked.
    expect((await bookingRow(a)).status).toBe('settled');
    expect((await bookingRow(b)).status).toBe('settled');

    const row = await sessionRow(session.id);
    expect(row.status).toBe('confirmed');
    expect(row.reviewed_at).not.toBeNull();
    expect(row.reviewed_by).toBe(USERS.coach.id);
  });

  it('settles a row added after the first confirm, and leaves the rest alone', async () => {
    // D39 keeps everything editable for 7 days, so pressing confirm is not the
    // end of anything and pressing it twice is a normal thing to do.
    const session = await createSession({ startsInMinutes: -181, status: 'pending_review' });
    const first = await createBookingRow({ sessionId: session.id, playerId: SUBJECT.id });

    await coach.rpc('confirm_session_review', { p_session_id: session.id });
    const settledAt = (
      await serviceClient().from('bookings').select('settled_at').eq('id', first).single()
    ).data?.settled_at;

    const { data: late } = await coach.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: 'Turned up late',
      p_guest_tier: 'B',
      p_is_free: true,
    });
    expect((await bookingRow(late as string)).status).toBe('confirmed');

    await coach.rpc('confirm_session_review', { p_session_id: session.id });

    expect((await bookingRow(late as string)).status).toBe('settled');
    const stillSettledAt = (
      await serviceClient().from('bookings').select('settled_at').eq('id', first).single()
    ).data?.settled_at;
    expect(stillSettledAt).toBe(settledAt);
  });

  it('refuses a session that has not been played yet', async () => {
    const session = await createSession({ startsInMinutes: 5 * 60 });
    const { error } = await coach.rpc('confirm_session_review', { p_session_id: session.id });
    expect(error?.message).toBe('session_not_in_review');
  });

  it('refuses a cancelled session', async () => {
    const session = await createSession({ startsInMinutes: -182, status: 'cancelled' });
    const { error } = await coach.rpc('confirm_session_review', { p_session_id: session.id });
    expect(error?.message).toBe('session_not_in_review');
  });

  it('refuses a player', async () => {
    const session = await createSession({ startsInMinutes: -183, status: 'pending_review' });
    const { error } = await player.rpc('confirm_session_review', { p_session_id: session.id });
    expect(error?.message).toBe('not_authorized');
  });

  it('lets an admin confirm. D16', async () => {
    const session = await createSession({ startsInMinutes: -184, status: 'pending_review' });
    const { error } = await admin.rpc('confirm_session_review', { p_session_id: session.id });
    expect(error).toBeNull();
    expect((await sessionRow(session.id)).status).toBe('confirmed');
  });
});

describe('reopen_session_review, 8.5', () => {
  it('puts the session and its bookings back where they were', async () => {
    const session = await createSession({ startsInMinutes: -185, status: 'pending_review' });
    const booking = await createBookingRow({ sessionId: session.id, playerId: SUBJECT.id });

    await coach.rpc('confirm_session_review', { p_session_id: session.id });
    const { error } = await coach.rpc('reopen_session_review', { p_session_id: session.id });

    expect(error).toBeNull();
    expect((await bookingRow(booking)).status).toBe('confirmed');

    const row = await sessionRow(session.id);
    expect(row.status).toBe('pending_review');
    expect(row.reviewed_at).toBeNull();
    expect(row.reviewed_by).toBeNull();
  });

  it('refuses a session that was never confirmed', async () => {
    const session = await createSession({ startsInMinutes: -186, status: 'pending_review' });
    const { error } = await coach.rpc('reopen_session_review', { p_session_id: session.id });
    expect(error?.message).toBe('session_not_confirmed');
  });

  it('refuses once the 7 day window has closed', async () => {
    // 8.5: "allowed until ends_at + 7 days". The session below is confirmed
    // and eight days old, and the nightly lock job has not run.
    const session = await createSession({
      startsInMinutes: -(8 * DAY),
      status: 'confirmed',
    });

    const { error } = await coach.rpc('reopen_session_review', { p_session_id: session.id });
    expect(error?.message).toBe('session_locked');
  });
});

describe('lock_expired_sessions, 8.6 and D39', () => {
  it('locks a session more than 7 days past its end and stamps locked_at', async () => {
    const session = await createSession({
      startsInMinutes: -(8 * DAY),
      status: 'pending_review',
    });

    expect(Number(sql('SELECT lock_expired_sessions()'))).toBeGreaterThanOrEqual(1);

    const row = await sessionRow(session.id);
    expect(row.status).toBe('locked');
    expect(row.locked_at).not.toBeNull();
  });

  it('leaves a session inside the window alone', async () => {
    const session = await createSession({
      startsInMinutes: -(6 * DAY),
      status: 'pending_review',
    });

    sql('SELECT lock_expired_sessions()');
    expect((await sessionRow(session.id)).status).toBe('pending_review');
  });

  it('leaves a cancelled session cancelled', async () => {
    // 9.4 gives it a terminal state of its own, with its credits already back
    // and no review to close.
    const session = await createSession({
      startsInMinutes: -(9 * DAY),
      status: 'cancelled',
    });

    sql('SELECT lock_expired_sessions()');
    expect((await sessionRow(session.id)).status).toBe('cancelled');
  });

  it('is not callable by staff or by a player', async () => {
    expect((await coach.rpc('lock_expired_sessions')).error).not.toBeNull();
    expect((await player.rpc('lock_expired_sessions')).error).not.toBeNull();
  });
});

describe('after the lock, every mutation on that session is refused', () => {
  let sessionId: string;
  let bookingId: string;

  beforeAll(async () => {
    const session = await createSession({
      startsInMinutes: -(10 * DAY),
      status: 'pending_review',
    });
    sessionId = session.id;
    bookingId = await createBookingRow({
      sessionId,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    sql('SELECT lock_expired_sessions()');
    expect((await sessionRow(sessionId)).status).toBe('locked');
  });

  it('refuses record_payment', async () => {
    const { error } = await coach.rpc('record_payment', {
      p_booking_id: bookingId,
      p_paid_fils: 6000,
    });

    expect(error?.message).toBe('session_locked');
    expect((await bookingRow(bookingId)).payment_status).toBe('unpaid');
    expect(await balanceEntriesFor(bookingId)).toHaveLength(0);
  });

  it('refuses confirm_session_review', async () => {
    const { error } = await coach.rpc('confirm_session_review', { p_session_id: sessionId });
    expect(error?.message).toBe('session_locked');
  });

  it('refuses reopen_session_review. "There is no unlock."', async () => {
    const { error } = await coach.rpc('reopen_session_review', { p_session_id: sessionId });
    expect(error?.message).toBe('session_locked');
  });

  it('refuses admin_remove_booking', async () => {
    const { error } = await coach.rpc('admin_remove_booking', { p_booking_id: bookingId });
    expect(error?.message).toBe('session_locked');
    expect((await bookingRow(bookingId)).status).toBe('confirmed');
  });

  it('refuses every way of adding somebody', async () => {
    const guest = await coach.rpc('admin_add_guest', {
      p_session_id: sessionId,
      p_guest_name: 'Too late',
      p_guest_tier: 'B',
      p_is_free: true,
    });
    const added = await coach.rpc('admin_add_player', {
      p_session_id: sessionId,
      p_player_id: OTHER.id,
    });
    const added_coach = await coach.rpc('admin_add_coach', {
      p_session_id: sessionId,
      p_coach_id: USERS.assistant.id,
      p_is_paid: false,
    });

    expect(guest.error?.message).toBe('session_locked');
    expect(added.error?.message).toBe('session_locked');
    expect(added_coach.error?.message).toBe('session_locked');
  });

  it('refuses editing or cancelling the session itself', async () => {
    const edited = await coach.rpc('update_session_instance', {
      p_session_id: sessionId,
      p_start_time: '19:00:00',
      p_duration_minutes: 90,
      p_price_fils: 7000,
      p_court_count: 4,
    });
    const cancelled = await coach.rpc('cancel_session', { p_session_id: sessionId });

    expect(edited.error?.message).toBe('session_locked');
    expect(cancelled.error?.message).toBe('session_locked');
  });
});

describe('the deadline binds before the nightly job runs', () => {
  it('refuses a mutation on a session past 7 days that still says pending_review', async () => {
    // The hours between the window closing and 03:10 Amman are not a window.
    const session = await createSession({
      startsInMinutes: -(8 * DAY),
      status: 'pending_review',
    });
    const booking = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });

    expect((await sessionRow(session.id)).status).toBe('pending_review');

    const { error } = await coach.rpc('record_payment', {
      p_booking_id: booking,
      p_paid_fils: 6000,
    });

    expect(error?.message).toBe('session_locked');
  });
});

describe('get_session_money_summary, 10.2’s footer', () => {
  it('adds up expected, collected, outstanding, cost and profit', async () => {
    // 12.2's three rules in one session: cash paid in full, cash paid in part,
    // a credit valued at its subscription's per-visit rate, and a free guest
    // taking a slot for nothing.
    const session = await createSession({
      startsInMinutes: -(2 * 60),
      status: 'pending_review',
      priceFils: 6000,
    });

    const paid = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });
    const partial = await createBookingRow({
      sessionId: session.id,
      playerId: OTHER.id,
      expectedFils: 6000,
    });
    const subscription = await grantSubscription(seededPlayer(25).id, 8);
    await createBookingRow({
      sessionId: session.id,
      playerId: seededPlayer(25).id,
      method: 'credit',
      subscriptionId: subscription,
    });
    await coach.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: 'Filling a gap',
      p_guest_tier: 'B',
      p_is_free: true,
    });

    await coach.rpc('record_payment', { p_booking_id: paid, p_paid_fils: 6000 });
    await coach.rpc('record_payment', { p_booking_id: partial, p_paid_fils: 2000 });

    const { data, error } = await coach.rpc('get_session_money_summary', {
      p_session_id: session.id,
    });

    expect(error).toBeNull();
    const summary = data?.[0];

    // The 8 visit package is 40 JD, so a credit off it is worth 5.000 JD.
    // Never the 6 JD session price. 12.2 rule 1.
    expect(summary).toMatchObject({
      expected_fils: 12000,
      collected_fils: 8000,
      credit_revenue_fils: 5000,
      outstanding_fils: 4000,
      attendee_count: 4,
    });

    // 12.3: profit = revenue received - cost, and the second figure is what
    // the coach would have if everybody paid up.
    expect(summary?.profit_fils).toBe(8000 + 5000 - (summary?.cost_fils ?? 0));
    expect(summary?.profit_if_collected_fils).toBe(8000 + 5000 + 4000 - (summary?.cost_fils ?? 0));
  });

  it('counts how many rows are still unreviewed', async () => {
    const session = await createSession({
      startsInMinutes: -(2 * 60) - 1,
      status: 'pending_review',
    });
    await createBookingRow({ sessionId: session.id, playerId: SUBJECT.id });
    await createBookingRow({ sessionId: session.id, playerId: OTHER.id });

    let { data } = await coach.rpc('get_session_money_summary', { p_session_id: session.id });
    expect(data?.[0]?.unsettled_count).toBe(2);

    await coach.rpc('confirm_session_review', { p_session_id: session.id });

    ({ data } = await coach.rpc('get_session_money_summary', { p_session_id: session.id }));
    expect(data?.[0]?.unsettled_count).toBe(0);
  });

  it('is readable by an admin, unlike the coach-only report view. D16, D73', async () => {
    const session = await createSession({
      startsInMinutes: -(2 * 60) - 2,
      status: 'pending_review',
    });

    const summary = await admin.rpc('get_session_money_summary', { p_session_id: session.id });
    expect(summary.error).toBeNull();

    const report = await admin.from('v_session_financials').select('session_id');
    expect(report.data).toEqual([]);
  });

  it('refuses a player', async () => {
    const session = await createSession({
      startsInMinutes: -(2 * 60) - 3,
      status: 'pending_review',
    });
    const { error } = await player.rpc('get_session_money_summary', { p_session_id: session.id });
    expect(error?.message).toBe('not_authorized');
  });
});
