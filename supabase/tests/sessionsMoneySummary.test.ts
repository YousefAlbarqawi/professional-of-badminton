/**
 * get_sessions_money_summary. BUILD-SPEC 15.1's payment summary, batched for
 * the Today list. Migration 0039.
 *
 * The per-session arithmetic is 0027's get_session_money_summary, already
 * covered in sessionReview.test.ts; what is worth a separate suite is the
 * batching itself — several sessions in one call, a session with nothing
 * booked reading as zero rather than being dropped, and the same is_staff()
 * gate 0027 uses.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';
import {
  cleanupFixtures,
  createBookingRow,
  createSession,
  grantSubscription,
  seededPlayer,
} from './helpers/bookingFixtures';

const SUBJECT = seededPlayer(26);
const OTHER = seededPlayer(27);

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

describe('get_sessions_money_summary, 15.1’s card', () => {
  it('adds collected and outstanding across every session it is given', async () => {
    const sessionA = await createSession({ startsInMinutes: -180, priceFils: 6000 });
    const sessionB = await createSession({ startsInMinutes: -190, priceFils: 6000 });

    const paidCash = await createBookingRow({
      sessionId: sessionA.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });
    await createBookingRow({ sessionId: sessionA.id, playerId: OTHER.id, expectedFils: 6000 });

    const subscription = await grantSubscription(seededPlayer(28).id, 8);
    await createBookingRow({
      sessionId: sessionB.id,
      playerId: seededPlayer(28).id,
      method: 'credit',
      subscriptionId: subscription,
    });

    await coach.rpc('record_payment', { p_booking_id: paidCash, p_paid_fils: 6000 });

    const { data, error } = await coach.rpc('get_sessions_money_summary', {
      p_session_ids: [sessionA.id, sessionB.id],
    });

    expect(error).toBeNull();
    const bySession = new Map(data?.map((row) => [row.session_id, row]));

    // Session A: one paid in full (6000), one still unpaid (expected 6000).
    expect(bySession.get(sessionA.id)).toMatchObject({
      collected_fils: 6000,
      outstanding_fils: 6000,
    });

    // Session B: one credit off the 8 visit package, worth 5.000 JD, per
    // 12.2 rule 1 — never the 6 JD session price — and nothing outstanding.
    expect(bySession.get(sessionB.id)).toMatchObject({
      collected_fils: 5000,
      outstanding_fils: 0,
    });
  });

  it('reads a session with nothing booked as zero rather than dropping it', async () => {
    const empty = await createSession({ startsInMinutes: -10 });

    const { data, error } = await coach.rpc('get_sessions_money_summary', {
      p_session_ids: [empty.id],
    });

    expect(error).toBeNull();
    expect(data).toEqual([
      { session_id: empty.id, collected_fils: 0, outstanding_fils: 0 },
    ]);
  });

  it('is readable by an admin, matching 0027’s own gate. D16', async () => {
    const session = await createSession({ startsInMinutes: -20 });

    const { error } = await admin.rpc('get_sessions_money_summary', {
      p_session_ids: [session.id],
    });

    expect(error).toBeNull();
  });

  it('refuses a player', async () => {
    const session = await createSession({ startsInMinutes: -30 });

    const { error } = await player.rpc('get_sessions_money_summary', {
      p_session_ids: [session.id],
    });

    expect(error?.message).toContain('not_authorized');
  });

  it('ignores a cancelled booking, same as the unbatched summary', async () => {
    const session = await createSession({ startsInMinutes: -40, priceFils: 6000 });
    const bookingId = await createBookingRow({
      sessionId: session.id,
      playerId: SUBJECT.id,
      expectedFils: 6000,
    });
    await serviceClient()
      .from('bookings')
      .update({ status: 'cancelled_by_admin' })
      .eq('id', bookingId);

    const { data } = await coach.rpc('get_sessions_money_summary', {
      p_session_ids: [session.id],
    });

    expect(data?.[0]).toMatchObject({ collected_fils: 0, outstanding_fils: 0 });
  });
});
