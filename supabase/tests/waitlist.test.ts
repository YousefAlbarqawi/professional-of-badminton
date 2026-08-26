/**
 * The waiting list. BUILD-SPEC 8.4, 9.5, D27, D28.
 *
 * D28 is the one the phase brief singles out: **a spot freed 40 minutes before
 * start notifies nobody.** Only the coach can fill it. The test for it is
 * `notifies nobody when a spot opens inside the last hour` below, and it is
 * written against notify_waitlist's return value — the number of entries it
 * stamped — because "nothing happened" is otherwise indistinguishable from
 * "the function was never called".
 *
 * Sending the push itself is phase 8. What phase 4 owes is the rule about when
 * there is anything to send.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { SESSIONS, USERS } from './helpers/fixtures';
import {
  cleanupFixtures,
  createBookingRow,
  createSession,
  fillSession,
  seededPlayer,
} from './helpers/bookingFixtures';

const WAITER = seededPlayer(17);
const SECOND = seededPlayer(18);

let waiter: Client;
let second: Client;
let coach: Client;

async function join(client: Client, sessionId: string): Promise<string | null> {
  const { error } = await client.rpc('join_waitlist', { p_session_id: sessionId });
  return error === null ? null : error.message.trim();
}

async function activeEntry(
  sessionId: string,
  playerId: string,
): Promise<{ left_at: string | null; notified_at: string | null } | null> {
  const { data } = await serviceClient()
    .from('waitlist_entries')
    .select('left_at, notified_at')
    .eq('session_id', sessionId)
    .eq('player_id', playerId)
    .maybeSingle();

  return data;
}

/** notify_waitlist is not callable by a client, so the probe uses service role. */
async function notify(sessionId: string): Promise<number> {
  const { data, error } = await serviceClient().rpc('notify_waitlist', {
    p_session_id: sessionId,
  });

  if (error) throw new Error(error.message);
  return data;
}

beforeAll(async () => {
  [waiter, second, coach] = await Promise.all([
    signIn(WAITER.email),
    signIn(SECOND.email),
    signIn(USERS.coach.email),
  ]);
}, 60000);

afterAll(async () => {
  await cleanupFixtures();
});

describe('joining and leaving', () => {
  it('joins a full session and leaves again', async () => {
    const session = await createSession({ startsInMinutes: 6 * 60, courtCount: 1 });
    await fillSession(session.id, 4);

    expect(await join(waiter, session.id)).toBeNull();
    expect((await activeEntry(session.id, WAITER.id))?.left_at).toBeNull();

    const { error } = await waiter.rpc('leave_waitlist', { p_session_id: session.id });
    expect(error).toBeNull();
    expect((await activeEntry(session.id, WAITER.id))?.left_at).not.toBeNull();
  });

  it('lets him rejoin the same list', async () => {
    const session = await createSession({ startsInMinutes: 7 * 60, courtCount: 1 });
    await fillSession(session.id, 4);

    await join(waiter, session.id);
    await waiter.rpc('leave_waitlist', { p_session_id: session.id });
    expect(await join(waiter, session.id)).toBeNull();

    const entry = await activeEntry(session.id, WAITER.id);
    expect(entry?.left_at).toBeNull();
  });

  it('is silent when he leaves a list he is not on', async () => {
    const session = await createSession({ startsInMinutes: 8 * 60 });
    const { error } = await waiter.rpc('leave_waitlist', { p_session_id: session.id });
    expect(error).toBeNull();
  });

  it('costs nothing and asks for no payment method', async () => {
    // D27: "Waiting list: free, no cap, no queue order, no auto promotion."
    const session = await createSession({ startsInMinutes: 9 * 60, courtCount: 1 });
    await fillSession(session.id, 4);
    await join(waiter, session.id);

    const { data } = await serviceClient()
      .from('bookings')
      .select('id')
      .eq('session_id', session.id)
      .eq('player_id', WAITER.id);

    expect(data).toEqual([]);
  });

  it('lets him sit on several lists at once, including overlapping ones', async () => {
    // 9.5: "A player may sit on any number of waitlists simultaneously ...
    // including overlapping times." D29 allows the overlap in the first place.
    const first = await createSession({ startsInMinutes: 10 * 60, courtCount: 1 });
    const overlapping = await createSession({
      startsInMinutes: 10 * 60,
      courtCount: 1,
      venueId: '11111111-1111-4111-8111-000000000002',
    });
    await fillSession(first.id, 4);
    await fillSession(overlapping.id, 4);

    expect(await join(waiter, first.id)).toBeNull();
    expect(await join(waiter, overlapping.id)).toBeNull();
  });

  it('refuses when he already has a spot -> already_booked', async () => {
    // 9.5, and Appendix A gives the same code as the booking path.
    const session = await createSession({ startsInMinutes: 11 * 60 });
    await createBookingRow({ sessionId: session.id, playerId: WAITER.id });

    expect(await join(waiter, session.id)).toBe('already_booked');
  });

  it('refuses inside the last hour -> booking_window_closed', async () => {
    // D28 again, from the other end: a list that can no longer be called is
    // not one to join. 14.7 shows *Booking closed* here, not the list.
    const session = await createSession({ startsInMinutes: 45, courtCount: 1 });
    await fillSession(session.id, 4);

    expect(await join(waiter, session.id)).toBe('booking_window_closed');
  });

  it('refuses a cancelled session -> session_not_open', async () => {
    expect(await join(waiter, SESSIONS.cancelled)).toBe('session_not_open');
  });

  it('refuses one beyond the 5 day window -> outside_booking_window', async () => {
    const session = await createSession({ startsInMinutes: 6 * 24 * 60 });
    expect(await join(waiter, session.id)).toBe('outside_booking_window');
  });

  it('shows a player his own entries and nobody else’s', async () => {
    const session = await createSession({ startsInMinutes: 12 * 60, courtCount: 1 });
    await fillSession(session.id, 4);
    await join(waiter, session.id);
    await join(second, session.id);

    const { data } = await waiter
      .from('waitlist_entries')
      .select('player_id')
      .eq('session_id', session.id);

    expect(data).toEqual([{ player_id: WAITER.id }]);
  });
});

describe('notify_waitlist', () => {
  it('notifies everybody waiting when a spot opens in good time', async () => {
    // D27: everyone at once, no ordering, first to press reserve wins.
    const session = await createSession({ startsInMinutes: 5 * 60, courtCount: 1 });
    await fillSession(session.id, 3);
    const bookingId = await createBookingRow({
      sessionId: session.id,
      playerId: seededPlayer(19).id,
    });

    await join(waiter, session.id);
    await join(second, session.id);

    const { error } = await coach.rpc('admin_remove_booking', { p_booking_id: bookingId });
    expect(error).toBeNull();

    expect((await activeEntry(session.id, WAITER.id))?.notified_at).not.toBeNull();
    expect((await activeEntry(session.id, SECOND.id))?.notified_at).not.toBeNull();
  });

  it('notifies nobody when a spot opens forty minutes before start', async () => {
    // D28, verbatim: "If a spot opens 40 minutes before start, nobody can
    // claim it in the app. Only the coach can fill it."
    //
    // The entry is arranged directly, because join_waitlist would refuse this
    // late and the rule under test is about the notification, not the join.
    const session = await createSession({ startsInMinutes: 40, courtCount: 1 });
    await fillSession(session.id, 3);
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: WAITER.id });

    await serviceClient()
      .from('waitlist_entries')
      .insert({ session_id: session.id, player_id: SECOND.id });

    const stamped = await notify(session.id);
    expect(stamped).toBe(0);

    const entry = await activeEntry(session.id, SECOND.id);
    expect(entry?.notified_at).toBeNull();

    // And the same silence through the real path the coach would take.
    await coach.rpc('admin_remove_booking', { p_booking_id: bookingId });
    expect((await activeEntry(session.id, SECOND.id))?.notified_at).toBeNull();
  });

  it('notifies at sixty-one minutes, which is the other side of the same line', async () => {
    const session = await createSession({ startsInMinutes: 61, courtCount: 1 });
    await fillSession(session.id, 3);
    const bookingId = await createBookingRow({ sessionId: session.id, playerId: WAITER.id });

    await serviceClient()
      .from('waitlist_entries')
      .insert({ session_id: session.id, player_id: SECOND.id });

    await coach.rpc('admin_remove_booking', { p_booking_id: bookingId });
    expect((await activeEntry(session.id, SECOND.id))?.notified_at).not.toBeNull();
  });

  it('says nothing while the session is still full', async () => {
    // 8.4 step 2. A cancellation that does not free a spot — there is none —
    // but also the case where two things happen at once.
    const session = await createSession({ startsInMinutes: 4 * 60, courtCount: 1 });
    await fillSession(session.id, 4);
    await serviceClient()
      .from('waitlist_entries')
      .insert({ session_id: session.id, player_id: SECOND.id });

    expect(await notify(session.id)).toBe(0);
  });

  it('says nothing to somebody who has left the list', async () => {
    const session = await createSession({ startsInMinutes: 3 * 60, courtCount: 1 });
    await fillSession(session.id, 3);
    await join(waiter, session.id);
    await waiter.rpc('leave_waitlist', { p_session_id: session.id });

    expect(await notify(session.id)).toBe(0);
    expect((await activeEntry(session.id, WAITER.id))?.notified_at).toBeNull();
  });

  it('is not callable by a player, nor by the coach', async () => {
    // Stamping notified_at on other people's rows is not a client operation.
    const session = await createSession({ startsInMinutes: 2 * 60 });

    const asPlayer = await waiter.rpc('notify_waitlist', { p_session_id: session.id });
    const asCoach = await coach.rpc('notify_waitlist', { p_session_id: session.id });

    expect(asPlayer.error).not.toBeNull();
    expect(asCoach.error).not.toBeNull();
  });
});

describe('close_started_waitlists', () => {
  it('clears the list when the session starts', async () => {
    // 9.5: "Waitlist entries are cleaned up when the session starts."
    const session = await createSession({ startsInMinutes: -5, status: 'in_progress' });
    await serviceClient()
      .from('waitlist_entries')
      .insert({ session_id: session.id, player_id: WAITER.id });

    const { data, error } = await serviceClient().rpc('close_started_waitlists');
    expect(error).toBeNull();
    expect(data).toBeGreaterThanOrEqual(1);

    expect((await activeEntry(session.id, WAITER.id))?.left_at).not.toBeNull();
  });
});
