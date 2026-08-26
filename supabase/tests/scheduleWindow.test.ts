import { ammanDayKey, bookingWindowEnd, nowInAmman } from '../../src/lib/time';
import { serviceClient, signIn, type Client } from './helpers/clients';
import { offsetDayKey } from './helpers/dates';
import { SESSIONS, USERS } from './helpers/fixtures';

/**
 * The 5 day booking window. BUILD-SPEC 5.2 and the phase 3 acceptance
 * criterion "the player sees exactly 5 days".
 *
 * Generation runs 21 days ahead (8.1). RLS caps what a player can read at 5
 * days (7.3). Both numbers are deliberate and they are not the same number —
 * the gap is what lets the coach edit and cancel future instances in advance.
 */
describe('the player’s 5 day window', () => {
  let player: Client;
  let service: Client;
  let today: string;

  beforeAll(async () => {
    player = await signIn(USERS.level0.email);
    service = serviceClient();

    const { data } = await service.rpc('amman_today');
    today = data as unknown as string;
  });

  function offsetDay(days: number): string {
    return offsetDayKey(today, days);
  }

  it('agrees with the client about where the window ends', async () => {
    // src/lib/time.ts computes today + 4; amman_today() + 4 is the same day.
    // If these ever drift, the schedule asks for a day RLS will not return.
    const clientEnd = ammanDayKey(bookingWindowEnd(nowInAmman()));

    expect(clientEnd).toBe(offsetDay(4));
  });

  it('reads today through day four and nothing beyond', async () => {
    const { data, error } = await player
      .from('session_instances')
      .select('session_date, status')
      .order('session_date', { ascending: true });

    expect(error).toBeNull();

    const dates = [...new Set((data ?? []).map((row) => row.session_date))].sort();
    const inWindow = dates.filter((date) => date >= today && date <= offsetDay(4));
    const beyond = dates.filter((date) => date > offsetDay(4));

    expect(inWindow.length).toBeGreaterThan(0);
    // 5 days inclusive of today: today, +1, +2, +3, +4. Never a sixth.
    expect(inWindow.every((date) => date <= offsetDay(4))).toBe(true);
    expect(beyond).toEqual([]);
  });

  it('spans no more than five distinct days', async () => {
    const { data } = await player.from('session_instances').select('session_date');

    const futureDates = [
      ...new Set((data ?? []).map((row) => row.session_date).filter((date) => date >= today)),
    ];

    expect(futureDates.length).toBeLessThanOrEqual(5);
  });

  it('cannot read a session on day five, however hard it asks', async () => {
    // Client-side filtering is presentation. RLS is the boundary, so asking
    // for the day directly has to come back empty rather than merely unshown.
    const { data, error } = await player
      .from('session_instances')
      .select('id')
      .eq('session_date', offsetDay(5));

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('does not see a cancelled session it has no booking on', async () => {
    const { data } = await player
      .from('session_instances')
      .select('id')
      .eq('id', SESSIONS.cancelled);

    expect(data).toEqual([]);
  });

  it('still sees a past session it does have a booking on', async () => {
    // A20. Without it, My Bookings and the cancelled-session banner cannot
    // render, because a player could not read a session he had reserved.
    const { data } = await player
      .from('session_instances')
      .select('id, session_date')
      .eq('id', SESSIONS.pastWithOwnBooking);

    expect(data).toHaveLength(1);
    expect(String(data?.[0]?.session_date) < today).toBe(true);
  });

  it('reads occupancy for a session in its window', async () => {
    // 14.6: "Occupancy display is identical at every visibility level. The
    // count is not private."
    const { data, error } = await player
      .from('v_session_occupancy')
      .select('session_id, capacity, taken, remaining')
      .eq('session_id', SESSIONS.open)
      .single();

    expect(error).toBeNull();
    expect(data?.capacity).toBe(16);
    expect(Number(data?.taken)).toBeGreaterThan(0);
    expect(Number(data?.capacity) - Number(data?.taken)).toBe(Number(data?.remaining));
  });
});

/**
 * The other half of the pair: staff read the whole 21 days that generation
 * produces, and the 30 the admin schedule asks for. 15.3.
 */
describe('what staff read', () => {
  let coach: Client;
  let service: Client;

  beforeAll(async () => {
    coach = await signIn(USERS.coach.email);
    service = serviceClient();
  });

  it('sees the full generated horizon, not the player’s five days', async () => {
    const { data: todayValue } = await service.rpc('amman_today');
    const dayFive = offsetDayKey(todayValue as unknown as string, 5);

    const { data, error } = await coach
      .from('session_instances')
      .select('session_date')
      .gte('session_date', dayFive);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('sees cancelled sessions, which 15.3 keeps on the list', async () => {
    const { data } = await coach
      .from('session_instances')
      .select('id')
      .eq('id', SESSIONS.cancelled);

    expect(data).toHaveLength(1);
  });
});
