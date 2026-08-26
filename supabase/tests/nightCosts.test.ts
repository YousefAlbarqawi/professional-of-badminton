import { splitEvenly, type Fils } from '../../src/lib/money';
import { serviceClient, signIn, type Client } from './helpers/clients';
import { nextWeekdayKey, offsetDayKey } from './helpers/dates';
import { USERS, VENUES } from './helpers/fixtures';

/**
 * Night cost allocation. BUILD-SPEC 12.1, and the phase 3 acceptance criterion
 * "cancelling one of two sessions on a night doubles the other's court cost
 * share".
 *
 * Every test builds its own night out of one-off sessions rather than leaning
 * on the seed, so that the arithmetic is checkable by hand and no other suite
 * is disturbed. The seed rates are the ones from section 22:
 *
 *   Khalda Saturday    60000    Shmeisani Sunday     47500
 *   Khalda Monday      50000    Shmeisani Tuesday    35000
 *   Khalda Thursday    60000    Shmeisani Wednesday  47500
 *   Khalda Friday      30000    Shmeisani Friday     22500
 */

const SHMEISANI_SUNDAY_FILS = 47500;
const KHALDA_SATURDAY_FILS = 60000;
const WATER_STANDARD_FILS = 1250;
const WATER_EXTENDED_FILS = 2500;

interface Instance {
  id: string;
  starts_at: string;
  status: string;
  court_cost_share_fils: number;
  water_cost_fils: number;
  coach_fee_share_fils: number;
}

describe('recompute_night_costs', () => {
  let coach: Client;
  let player: Client;
  let service: Client;
  const created: string[] = [];

  beforeAll(async () => {
    [coach, player] = await Promise.all([signIn(USERS.coach.email), signIn(USERS.level0.email)]);
    service = serviceClient();
  });

  afterEach(async () => {
    if (created.length > 0) {
      await service.from('session_instances').delete().in('id', created.splice(0));
    }
  });

  /** The next date, well beyond the seeded window, falling on `weekday`. */
  async function futureDate(weekday: number): Promise<string> {
    const { data } = await service.rpc('amman_today');
    // 30 days out clears both the seeded 21 day horizon and the player window,
    // so these nights are empty until a test fills them.
    return nextWeekdayKey(offsetDayKey(data as unknown as string, 30), weekday);
  }

  async function addSession(
    venueId: string,
    sessionDate: string,
    startTime: string,
    durationMinutes: 90 | 150 = 90,
  ): Promise<string> {
    const { data, error } = await coach.rpc('create_one_off_session', {
      p_venue_id: venueId,
      p_session_date: sessionDate,
      p_start_time: startTime,
      p_duration_minutes: durationMinutes,
      p_price_fils: 6000,
      p_court_count: 3,
    });

    expect(error).toBeNull();
    created.push(data as unknown as string);
    return data as unknown as string;
  }

  async function nightOf(venueId: string, sessionDate: string): Promise<Instance[]> {
    const { data } = await service
      .from('session_instances')
      .select('id, starts_at, status, court_cost_share_fils, water_cost_fils, coach_fee_share_fils')
      .eq('venue_id', venueId)
      .eq('session_date', sessionDate)
      .order('starts_at', { ascending: true });

    return (data ?? []) as Instance[];
  }

  it('gives one session the whole night', async () => {
    const date = await futureDate(0); // Sunday
    await addSession(VENUES.shmeisani, date, '19:30');

    const night = await nightOf(VENUES.shmeisani, date);

    expect(night).toHaveLength(1);
    expect(night[0]?.court_cost_share_fils).toBe(SHMEISANI_SUNDAY_FILS);
    expect(night[0]?.water_cost_fils).toBe(WATER_STANDARD_FILS);
  });

  it('splits a night evenly between two sessions', async () => {
    const date = await futureDate(0);
    await addSession(VENUES.shmeisani, date, '19:30');
    await addSession(VENUES.shmeisani, date, '21:00');

    const night = await nightOf(VENUES.shmeisani, date);

    expect(night.map((row) => row.court_cost_share_fils)).toEqual([23750, 23750]);
  });

  it('gives the remainder to the earliest session across three', async () => {
    // 5.3's own worked example: 47500 across 3 is 15834, 15833, 15833, and the
    // parts always sum back to the total exactly.
    const date = await futureDate(0);
    await addSession(VENUES.shmeisani, date, '17:00');
    await addSession(VENUES.shmeisani, date, '19:30');
    await addSession(VENUES.shmeisani, date, '21:00');

    const night = await nightOf(VENUES.shmeisani, date);
    const shares = night.map((row) => row.court_cost_share_fils);

    expect(shares).toEqual([15834, 15833, 15833]);
    expect(shares.reduce((total, part) => total + part, 0)).toBe(SHMEISANI_SUNDAY_FILS);
    // The client's splitEvenly agrees, which is what keeps a report computed on
    // the phone reconciling with one computed in Postgres.
    expect(shares).toEqual(splitEvenly(SHMEISANI_SUNDAY_FILS as Fils, 3));
  });

  it('doubles the survivor when one of two sessions is cancelled', async () => {
    // The phase 3 acceptance criterion, in full.
    const date = await futureDate(0);
    const first = await addSession(VENUES.shmeisani, date, '19:30');
    const second = await addSession(VENUES.shmeisani, date, '21:00');

    expect((await nightOf(VENUES.shmeisani, date)).map((r) => r.court_cost_share_fils)).toEqual([
      23750, 23750,
    ]);

    const { error } = await coach.rpc('cancel_session', {
      p_session_id: second,
      p_note: 'The hall is double booked.',
    });
    expect(error).toBeNull();

    const after = await nightOf(VENUES.shmeisani, date);
    const survivor = after.find((row) => row.id === first);
    const cancelled = after.find((row) => row.id === second);

    expect(survivor?.court_cost_share_fils).toBe(SHMEISANI_SUNDAY_FILS);
    expect(survivor?.court_cost_share_fils).toBe(23750 * 2);
    // The cancelled session keeps whatever snapshot it had. It is not part of
    // the division any more, and rewriting it would only lose information.
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.court_cost_share_fils).toBe(23750);
  });

  it('redivides the night when a session is added to it', async () => {
    const date = await futureDate(6); // Saturday, Khalda, 60000
    const first = await addSession(VENUES.khalda, date, '19:00');

    expect((await nightOf(VENUES.khalda, date))[0]?.court_cost_share_fils).toBe(
      KHALDA_SATURDAY_FILS,
    );

    await addSession(VENUES.khalda, date, '20:30');

    const after = await nightOf(VENUES.khalda, date);
    expect(after.find((row) => row.id === first)?.court_cost_share_fils).toBe(30000);
    expect(after).toHaveLength(2);
    expect(after.every((row) => row.court_cost_share_fils === 30000)).toBe(true);
  });

  it('reaches 12.4’s break-even cost for a Khalda Saturday', async () => {
    // 12.4: "Khalda Sat, each of two | 31.25 JD". 30000 court + 1250 water.
    const date = await futureDate(6);
    await addSession(VENUES.khalda, date, '19:00');
    await addSession(VENUES.khalda, date, '20:30');

    const night = await nightOf(VENUES.khalda, date);

    for (const row of night) {
      const cost = row.court_cost_share_fils + row.water_cost_fils + row.coach_fee_share_fils;
      expect(cost).toBe(31250);
    }
  });

  it('charges the extended water rate on a 150 minute session', async () => {
    // D75: 1.25 JD standard, 2.5 JD extended.
    const date = await futureDate(2); // Tuesday, Shmeisani
    await addSession(VENUES.shmeisani, date, '20:30', 150);

    const night = await nightOf(VENUES.shmeisani, date);

    expect(night[0]?.water_cost_fils).toBe(WATER_EXTENDED_FILS);
  });

  it('freezes the snapshot once a session is confirmed', async () => {
    // 12.1: "Once a session is confirmed or locked, its cost snapshot is
    // frozen." Otherwise every historical profit figure silently rewrites
    // itself the next time a sibling session changes.
    const date = await futureDate(0);
    const first = await addSession(VENUES.shmeisani, date, '19:30');
    const second = await addSession(VENUES.shmeisani, date, '21:00');

    await service.from('session_instances').update({ status: 'confirmed' }).eq('id', first);

    await service.rpc('recompute_night_costs', {
      p_venue_id: VENUES.shmeisani,
      p_session_date: date,
    });

    const after = await nightOf(VENUES.shmeisani, date);
    // The confirmed one keeps 23750 even though it is still one of two.
    expect(after.find((row) => row.id === first)?.court_cost_share_fils).toBe(23750);
    expect(after.find((row) => row.id === second)?.court_cost_share_fils).toBe(23750);

    // And it stays frozen when the sibling goes away, which is the case that
    // would otherwise rewrite it to the full 47500.
    await service.from('session_instances').update({ status: 'cancelled' }).eq('id', second);
    await service.rpc('recompute_night_costs', {
      p_venue_id: VENUES.shmeisani,
      p_session_date: date,
    });

    const frozen = await nightOf(VENUES.shmeisani, date);
    expect(frozen.find((row) => row.id === first)?.court_cost_share_fils).toBe(23750);
  });

  it('counts an assistant coach once per night, not once per session', async () => {
    // D76: "An assistant coach costs 10 JD per day, not per session." The fee
    // is 10000 for the night and it splits across the night's sessions.
    const date = await futureDate(0);
    const first = await addSession(VENUES.shmeisani, date, '19:30');
    const second = await addSession(VENUES.shmeisani, date, '21:00');

    const nightKey = `${VENUES.shmeisani}${date}`;
    await service.from('session_coaches').insert([
      {
        session_id: first,
        coach_id: USERS.assistant.id,
        night_key: nightKey,
        added_by: USERS.coach.id,
      },
      {
        session_id: second,
        coach_id: USERS.assistant.id,
        night_key: nightKey,
        added_by: USERS.coach.id,
      },
    ]);

    await service.rpc('recompute_night_costs', {
      p_venue_id: VENUES.shmeisani,
      p_session_date: date,
    });

    const night = await nightOf(VENUES.shmeisani, date);
    const total = night.reduce((sum, row) => sum + row.coach_fee_share_fils, 0);

    expect(total).toBe(10000);
    expect(night.map((row) => row.coach_fee_share_fils)).toEqual([5000, 5000]);
  });

  it('is not callable from the app', async () => {
    const date = await futureDate(0);

    const asPlayer = await player.rpc('recompute_night_costs', {
      p_venue_id: VENUES.shmeisani,
      p_session_date: date,
    });
    const asCoach = await coach.rpc('recompute_night_costs', {
      p_venue_id: VENUES.shmeisani,
      p_session_date: date,
    });

    expect(asPlayer.error).not.toBeNull();
    expect(asCoach.error).not.toBeNull();
  });
});
