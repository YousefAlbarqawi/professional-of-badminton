import { serviceClient, signIn, type Client } from './helpers/clients';
import { BOOKINGS, SESSIONS, USERS } from './helpers/fixtures';

/**
 * "Any player selecting directly from bookings gets only his own rows."
 *
 * The RPC above is the sanctioned path. This proves the unsanctioned one is
 * closed: a player who crafts his own PostgREST query against the table sees
 * his own bookings and nothing else, on a session where five other people are
 * demonstrably booked.
 */
describe('a player selecting directly from bookings', () => {
  let level0: Client;
  let level2: Client;

  beforeAll(async () => {
    [level0, level2] = await Promise.all([signIn(USERS.level0.email), signIn(USERS.level2.email)]);
  });

  it('gets rows, but every one of them is his', async () => {
    const { data, error } = await level0.from('bookings').select('id, player_id');

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((row) => row.player_id === USERS.level0.id)).toBe(true);
  });

  it('sees one row on a session with six attendees', async () => {
    const { data } = await level0.from('bookings').select('id').eq('session_id', SESSIONS.open);

    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(BOOKINGS.level0OnOpenSession);
  });

  it('cannot reach another player’s booking by asking for it by id', async () => {
    const { data, error } = await level0
      .from('bookings')
      .select('*')
      .eq('id', BOOKINGS.cliqPlayerOnOpenSession);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('cannot see guest bookings, which belong to no player at all', async () => {
    const { data } = await level0
      .from('bookings')
      .select('id')
      .eq('id', BOOKINGS.guestOnOpenSession);

    expect(data).toEqual([]);
  });

  it('is not helped by a higher visibility level', async () => {
    // level_2 buys names through get_session_attendees, not table access.
    const { data } = await level2.from('bookings').select('player_id');

    expect(data?.every((row) => row.player_id === USERS.level2.id)).toBe(true);
  });

  it('cannot insert a booking directly; that is create_booking’s job', async () => {
    const { error } = await level0.from('bookings').insert({
      session_id: SESSIONS.open,
      attendee_kind: 'player',
      player_id: USERS.level0.id,
      payment_method: 'cash',
      expected_fils: 0,
    });

    expect(error).not.toBeNull();
  });

  it('cannot change what he owes on his own booking', async () => {
    const { data, error } = await level0
      .from('bookings')
      .update({ paid_fils: 6000, payment_status: 'paid' })
      .eq('id', BOOKINGS.level0OnOpenSession)
      .select();

    // No UPDATE policy matches, so the row is invisible to the write rather
    // than rejected outright. Either way nothing changes.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const service = serviceClient();
    const { data: actual } = await service
      .from('bookings')
      .select('paid_fils, payment_status')
      .eq('id', BOOKINGS.level0OnOpenSession)
      .single();

    expect(actual?.paid_fils).toBe(0);
    expect(actual?.payment_status).toBe('unpaid');
  });

  it('reads his own past bookings', async () => {
    const { data } = await level0
      .from('bookings')
      .select('id')
      .eq('session_id', SESSIONS.pastWithOwnBooking);

    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(BOOKINGS.level0OnPastSession);
  });
});
