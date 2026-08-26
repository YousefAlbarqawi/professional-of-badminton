/**
 * The last spot, claimed twice at once. BUILD-SPEC 5.4 and 19.1.
 *
 * "Two players tapping reserve on the last spot at the same moment must
 * produce exactly one booking and one clear error."
 *
 * What makes that true is one line in create_booking:
 *
 *     SELECT * INTO v_session FROM session_instances
 *       WHERE id = p_session_id FOR UPDATE;
 *
 * It serialises every caller on the session row *before* anybody counts, so
 * the second transaction blocks until the first has committed and then reads a
 * count that already includes it. Without it both read the same count, both
 * pass the capacity check and the session oversells — which D30 forbids under
 * any circumstance.
 *
 * This test is the reason that line must not be removed. It is written so that
 * it fails if it ever is: the two calls are dispatched without awaiting either,
 * so they are genuinely in flight together.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import {
  cleanupFixtures,
  createSession,
  fillSession,
  seededPlayer,
} from './helpers/bookingFixtures';

const RACERS = [
  seededPlayer(11),
  seededPlayer(12),
  seededPlayer(13),
  seededPlayer(14),
  seededPlayer(15),
  seededPlayer(16),
] as const;

let clients: Client[] = [];

interface Attempt {
  bookingId: string | null;
  code: string | null;
}

async function book(client: Client, sessionId: string): Promise<Attempt> {
  const { data, error } = await client.rpc('create_booking', {
    p_session_id: sessionId,
    p_payment_method: 'cash',
  });

  return { bookingId: data ?? null, code: error === null ? null : error.message.trim() };
}

async function confirmedCount(sessionId: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'confirmed');

  if (error) throw new Error(error.message);
  return count ?? 0;
}

beforeAll(async () => {
  clients = await Promise.all(RACERS.map((racer) => signIn(racer.email)));
}, 60000);

afterAll(async () => {
  await cleanupFixtures();
});

describe('two players on the last spot', () => {
  it('produces exactly one booking and one session_full', async () => {
    // One court is four players. Three are already in, so there is one left.
    const session = await createSession({ startsInMinutes: 20 * 60, courtCount: 1 });
    await fillSession(session.id, 3);

    const [first, second] = await Promise.all([
      book(clients[0] as Client, session.id),
      book(clients[1] as Client, session.id),
    ]);

    const attempts = [first, second];
    const won = attempts.filter((attempt) => attempt.code === null);
    const lost = attempts.filter((attempt) => attempt.code === 'session_full');

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(won[0]?.bookingId).not.toBeNull();

    // And the session is exactly full, not one over.
    expect(await confirmedCount(session.id)).toBe(4);
  });

  it('does not oversell when six players race for two spots', async () => {
    // The same rule under more pressure. Whatever happens, capacity holds and
    // every loser is told the same thing, which is what 9.5 asks the UI to
    // present gently.
    const session = await createSession({ startsInMinutes: 21 * 60, courtCount: 1 });
    await fillSession(session.id, 2);

    const attempts = await Promise.all(clients.map((client) => book(client, session.id)));

    const won = attempts.filter((attempt) => attempt.code === null);
    const lost = attempts.filter((attempt) => attempt.code === 'session_full');

    expect(won).toHaveLength(2);
    expect(lost).toHaveLength(4);
    expect(await confirmedCount(session.id)).toBe(4);
  });

  it('never lets one player take two spots by racing himself', async () => {
    // The unique index on (session_id, player_id) where status = 'confirmed'
    // is the backstop, but the already_booked check under the same lock is
    // what turns a constraint violation into an error a player can read.
    const session = await createSession({ startsInMinutes: 22 * 60, courtCount: 1 });
    const client = clients[0] as Client;

    const attempts = await Promise.all([
      book(client, session.id),
      book(client, session.id),
      book(client, session.id),
    ]);

    expect(attempts.filter((attempt) => attempt.code === null)).toHaveLength(1);
    expect(await confirmedCount(session.id)).toBe(1);
  });
});
