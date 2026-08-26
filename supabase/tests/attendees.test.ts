import { signIn, type Client } from './helpers/clients';
import { OPEN_SESSION_ATTENDEE_COUNT, SESSIONS, USERS } from './helpers/fixtures';

/**
 * get_session_attendees, section 7.2. This is the whole of the visibility
 * model: a level 0 player must not be able to obtain another player's name
 * from the API by any means, and row filtering alone cannot express "you may
 * see this row but only two of its columns".
 *
 * The fixture session has six confirmed attendees: five players and one guest.
 */
describe('get_session_attendees', () => {
  let level0: Client;
  let level1: Client;
  let level2: Client;
  let outsider: Client;
  let admin: Client;
  let coach: Client;

  beforeAll(async () => {
    [level0, level1, level2, outsider, admin, coach] = await Promise.all([
      signIn(USERS.level0.email),
      signIn(USERS.level1.email),
      signIn(USERS.level2.email),
      signIn(USERS.outsider.email),
      signIn(USERS.admin.email),
      signIn(USERS.coach.email),
    ]);
  });

  describe('a level_0 player', () => {
    it('gets his own row and nothing else', async () => {
      const { data, error } = await level0.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.is_self).toBe(true);
    });

    it('gets no name and no tier, not even his own', async () => {
      const { data } = await level0.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(data?.[0]?.display_name).toBeNull();
      expect(data?.[0]?.tier).toBeNull();
    });

    it('gets nothing at all for a session he is not booked on', async () => {
      const { data, error } = await outsider.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('a level_1 player', () => {
    it('gets every attendee', async () => {
      const { data, error } = await level1.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(error).toBeNull();
      expect(data).toHaveLength(OPEN_SESSION_ATTENDEE_COUNT);
    });

    it('gets tiers', async () => {
      const { data } = await level1.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(data?.every((row) => row.tier !== null)).toBe(true);
    });

    it('gets no names, on any row', async () => {
      const { data } = await level1.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(data?.every((row) => row.display_name === null)).toBe(true);
    });

    it('can still tell which row is his', async () => {
      const { data } = await level1.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(data?.filter((row) => row.is_self)).toHaveLength(1);
    });
  });

  describe('a level_2 player', () => {
    it('gets both names and tiers', async () => {
      const { data, error } = await level2.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(error).toBeNull();
      expect(data).toHaveLength(OPEN_SESSION_ATTENDEE_COUNT);
      expect(data?.every((row) => row.display_name !== null)).toBe(true);
      expect(data?.every((row) => row.tier !== null)).toBe(true);
    });

    it('sees the guest by the name the coach typed', async () => {
      const { data } = await level2.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(data?.map((row) => row.display_name)).toContain('Sami the Guest');
    });
  });

  describe('staff', () => {
    it('the admin gets names and tiers regardless of his own visibility', async () => {
      const { data, error } = await admin.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(error).toBeNull();
      expect(data).toHaveLength(OPEN_SESSION_ATTENDEE_COUNT);
      expect(data?.every((row) => row.display_name !== null)).toBe(true);
    });

    it('the coach gets names and tiers', async () => {
      const { data, error } = await coach.rpc('get_session_attendees', {
        p_session_id: SESSIONS.open,
      });

      expect(error).toBeNull();
      expect(data).toHaveLength(OPEN_SESSION_ATTENDEE_COUNT);
      expect(data?.every((row) => row.display_name !== null)).toBe(true);
    });
  });

  it('returns only confirmed bookings', async () => {
    const { data } = await coach.rpc('get_session_attendees', {
      p_session_id: SESSIONS.cancelled,
    });

    expect(data).toEqual([]);
  });
});
