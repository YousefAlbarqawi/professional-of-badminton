import { ammanDayKey, nowInAmman } from '../../src/lib/time';
import { serviceClient, signIn, type Client } from './helpers/clients';
import { OPEN_SESSION_ATTENDEE_COUNT, SESSIONS, USERS } from './helpers/fixtures';

/**
 * The rest of the section 7.3 grid, from a player's seat.
 */
describe('what a player can read', () => {
  let player: Client;
  let cliqPlayer: Client;

  beforeAll(async () => {
    [player, cliqPlayer] = await Promise.all([
      signIn(USERS.level0.email),
      signIn(USERS.cliqPlayer.email),
    ]);
  });

  describe('reference data', () => {
    it('sees both active venues', async () => {
      const { data, error } = await player.from('venues').select('id');
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
    });

    it('sees the five packages, so a subscription can be named', async () => {
      const { data } = await player.from('packages').select('id');
      expect(data).toHaveLength(5);
    });

    it('sees published announcements but not soft deleted ones', async () => {
      const { data } = await player.from('announcements').select('id, is_deleted');
      expect(data).toHaveLength(2);
      expect(data?.every((row) => row.is_deleted === false)).toBe(true);
    });
  });

  describe('what is none of his business', () => {
    it.each([
      'session_templates',
      'venue_night_costs',
      'consumable_costs',
      'coach_fee_rates',
      'balance_entries',
      'session_coaches',
      'rotations',
      'court_assignments',
      'rotation_sitouts',
      'locked_courts',
      'pairing_rules',
      'audit_log',
    ])('reads nothing from %s', async (table) => {
      // @ts-expect-error the table name is a runtime string over the whole set
      const { data, error } = await player.from(table).select('*').limit(5);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('reads nothing from balance_entries even though he owes money', async () => {
      // A4: the player does not see what he owes. He has entries; he sees none.
      const { data } = await player
        .from('balance_entries')
        .select('*')
        .eq('player_id', USERS.level0.id);

      expect(data).toEqual([]);
    });

    it('gets no total from v_player_total_balance', async () => {
      const { data } = await player.from('v_player_total_balance').select('*');
      expect(data).toEqual([]);
    });
  });

  describe('the session schedule window', () => {
    it('sees a session inside the 5 day window', async () => {
      const { data } = await player.from('session_instances').select('id').eq('id', SESSIONS.open);

      expect(data).toHaveLength(1);
    });

    it('does not see a session beyond the window', async () => {
      const { data } = await player
        .from('session_instances')
        .select('id')
        .eq('id', SESSIONS.outsideWindow);

      expect(data).toEqual([]);
    });

    it('does not see a cancelled session he is not booked on', async () => {
      const { data } = await player
        .from('session_instances')
        .select('id')
        .eq('id', SESSIONS.cancelled);

      expect(data).toEqual([]);
    });

    it('sees a past session he is booked on, so My Bookings can render it', async () => {
      // Assumption A20.
      const { data } = await player
        .from('session_instances')
        .select('id')
        .eq('id', SESSIONS.pastWithOwnBooking);

      expect(data).toHaveLength(1);
    });

    it('sees past sessions only where he has a booking, never any other', async () => {
      // session_date is an Amman calendar day, so 'today' has to be one too.
      const today = ammanDayKey(nowInAmman());

      const { data: visible } = await player
        .from('session_instances')
        .select('id')
        .lt('session_date', today);

      const { data: ownBookings } = await player.from('bookings').select('session_id');
      const bookedSessionIds = new Set(ownBookings?.map((row) => row.session_id));

      expect(visible?.length).toBeGreaterThan(0);
      expect(visible?.every((row) => bookedSessionIds.has(row.id))).toBe(true);
      expect(visible?.map((row) => row.id)).toContain(SESSIONS.pastWithOwnBooking);

      // And that is a strict subset: the academy ran far more sessions than he
      // attended, and he can see none of the others.
      const { count: allPast } = await serviceClient()
        .from('session_instances')
        .select('*', { count: 'exact', head: true })
        .lt('session_date', today);

      expect(allPast).toBeGreaterThan(visible?.length ?? 0);
    });
  });

  describe('occupancy', () => {
    it('is visible in full at level_0, because the count is not private', async () => {
      const { data, error } = await player
        .from('v_session_occupancy')
        .select('*')
        .eq('session_id', SESSIONS.open)
        .single();

      expect(error).toBeNull();
      expect(data?.taken).toBe(OPEN_SESSION_ATTENDEE_COUNT);
      expect(data?.capacity).toBe(16);
      expect(data?.remaining).toBe(16 - OPEN_SESSION_ATTENDEE_COUNT);
    });
  });

  describe('his own rows', () => {
    it('sees only his own profile', async () => {
      const { data } = await player.from('profiles').select('id');
      expect(data).toHaveLength(1);
      expect(data?.[0]?.id).toBe(USERS.level0.id);
    });

    it('sees only his own subscriptions', async () => {
      const { data } = await player.from('player_subscriptions').select('player_id');
      expect(data?.length).toBeGreaterThan(0);
      expect(data?.every((row) => row.player_id === USERS.level0.id)).toBe(true);
    });

    it('sees only his own credit ledger, and it reads as section 11.3', async () => {
      const { data } = await player.from('credit_transactions').select('delta, reason, player_id');

      expect(data?.every((row) => row.player_id === USERS.level0.id)).toBe(true);
      expect(data?.map((row) => row.delta)).toEqual(expect.arrayContaining([40, -13]));

      const balance = data?.reduce((sum, row) => sum + row.delta, 0);
      expect(balance).toBe(27);
    });

    it('sees only his own device tokens', async () => {
      const { data } = await player.from('device_tokens').select('player_id');
      expect(data?.every((row) => row.player_id === USERS.level0.id)).toBe(true);
    });

    it('sees no waiting list entry but his own', async () => {
      const { data } = await player.from('waitlist_entries').select('player_id');
      expect(data?.every((row) => row.player_id === USERS.level0.id)).toBe(true);
    });

    // Counted assertions would be hostage to the seed, which since phase 5
    // gives every historical CliQ booking a proof row (10.1). What the policy
    // promises is a boundary, not a number: every proof a player can read
    // hangs off a booking of his own, and none of anybody else's does.
    it('sees no payment proof that is not on one of his own bookings', async () => {
      const { data } = await player
        .from('payment_proofs')
        .select('booking_id, bookings!inner ( player_id )');

      expect(
        data?.every(
          (row) => (row.bookings as unknown as { player_id: string }).player_id === USERS.level0.id,
        ),
      ).toBe(true);
    });

    it('sees the proof on his own booking', async () => {
      const { data } = await cliqPlayer
        .from('payment_proofs')
        .select('booking_id, bookings!inner ( player_id )');

      expect(data?.length).toBeGreaterThan(0);
      expect(
        data?.every(
          (row) =>
            (row.bookings as unknown as { player_id: string }).player_id === USERS.cliqPlayer.id,
        ),
      ).toBe(true);
      expect(data?.map((row) => row.booking_id)).toContain('55555555-5555-4555-8555-000000000004');
    });
  });
});
