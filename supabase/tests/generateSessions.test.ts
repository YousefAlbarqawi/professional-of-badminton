import { addMinutes } from 'date-fns';

import { nowInAmman, parseInstant } from '../../src/lib/time';
import { serviceClient, signIn, type Client } from './helpers/clients';
import { offsetDayKey } from './helpers/dates';
import { USERS, VENUES } from './helpers/fixtures';

/**
 * `generate_sessions`. BUILD-SPEC 8.1 and the phase 3 acceptance criterion
 * "seeded templates produce 21 days of correct sessions".
 *
 * Every test here works on the forward window, which the seed already filled,
 * and restores it afterwards by regenerating. The past is never touched.
 */
describe('generate_sessions', () => {
  let service: Client;
  let coach: Client;
  let player: Client;

  beforeAll(async () => {
    service = serviceClient();
    [coach, player] = await Promise.all([signIn(USERS.coach.email), signIn(USERS.level0.email)]);
  });

  afterAll(async () => {
    // Leave the window as the other suites expect to find it.
    await service.rpc('generate_sessions', { p_days_ahead: 21 });
  });

  /**
   * Only template-generated rows are ever deleted here. The seed's four
   * fixture sessions are ad hoc — `template_id` is null on all of them — and
   * every other suite in this folder asserts against them by id, so wiping the
   * window wholesale would take them out and never put them back.
   */
  function templateSessions() {
    return service.from('session_instances').delete().not('template_id', 'is', null);
  }

  async function ammanToday(): Promise<string> {
    const { data } = await service.rpc('amman_today');
    return data as unknown as string;
  }

  async function daysAhead(days: number): Promise<string> {
    return offsetDayKey(await ammanToday(), days);
  }

  it('creates nothing when the window is already generated', async () => {
    // Idempotence is what makes a nightly cron safe to run twice.
    const { data, error } = await service.rpc('generate_sessions', { p_days_ahead: 21 });

    expect(error).toBeNull();
    expect(data).toBe(0);
  });

  it('regenerates the forward window from the twelve templates', async () => {
    const today = await ammanToday();

    // 3.1 lists twelve weekly slots: Khalda has one Saturday pair, one Monday
    // extended, one Thursday pair and one Friday; Shmeisani has one Sunday
    // pair, one Tuesday extended, one Wednesday pair and one Friday.
    const { count: templateCount } = await service
      .from('session_templates')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    expect(templateCount).toBe(12);

    await templateSessions().gte('session_date', today);

    const { data: created, error } = await service.rpc('generate_sessions', {
      p_days_ahead: 21,
    });

    expect(error).toBeNull();
    // 22 days inclusive is three whole weeks plus a day, and the schedule runs
    // twelve sessions a week, so this is always between 36 and 39.
    expect(created).toBeGreaterThanOrEqual(36);
    expect(created).toBeLessThanOrEqual(39);
  });

  it('reaches 21 days ahead and no further', async () => {
    const horizon = await daysAhead(21);
    const beyond = await daysAhead(22);

    const { count: atHorizon } = await service
      .from('session_instances')
      .select('id', { count: 'exact', head: true })
      .lte('session_date', horizon)
      .gte('session_date', await ammanToday());

    const { count: past } = await service
      .from('session_instances')
      .select('id', { count: 'exact', head: true })
      .gte('session_date', beyond);

    expect(atHorizon ?? 0).toBeGreaterThan(0);
    expect(past).toBe(0);
  });

  it('computes starts and ends in Amman, not in UTC', async () => {
    // 5.1: all timestamptz columns store UTC and every business comparison
    // converts to Asia/Amman first. Khalda's Saturday pair is 19:00 and 20:30
    // local, which is 16:00 and 17:30 UTC year round — Jordan has had no
    // daylight saving since 2022.
    const { data } = await service
      .from('session_instances')
      .select('starts_at, ends_at, session_type, price_fils, court_count, rotation_count')
      .eq('venue_id', VENUES.khalda)
      .gte('session_date', await ammanToday())
      .order('starts_at', { ascending: true });

    const saturdays = (data ?? []).filter(
      (row) => parseInstant(row.starts_at).getUTCHours() === 16,
    );

    expect(saturdays.length).toBeGreaterThan(0);

    for (const row of saturdays) {
      const starts = parseInstant(row.starts_at);
      const ends = parseInstant(row.ends_at);
      expect(ends.getTime() - starts.getTime()).toBe(90 * 60 * 1000);
      expect(row.session_type).toBe('standard');
      expect(row.price_fils).toBe(6000);
      expect(row.court_count).toBe(4);
      expect(row.rotation_count).toBe(4);
    }
  });

  it('copies the extended template’s own numbers', async () => {
    // D5: 150 minutes, 8 JD, 6 rotations.
    const { data } = await service
      .from('session_instances')
      .select('starts_at, ends_at, session_type, price_fils, rotation_count')
      .eq('session_type', 'extended')
      .gte('session_date', await ammanToday())
      .limit(1)
      .single();

    expect(data?.price_fils).toBe(8000);
    expect(data?.rotation_count).toBe(6);
    expect(
      parseInstant(String(data?.ends_at)).getTime() -
        parseInstant(String(data?.starts_at)).getTime(),
    ).toBe(150 * 60 * 1000);
  });

  it('gives every generated session its cost snapshot', async () => {
    // 8.1 step 5 calls recompute_night_costs for each affected night, so a
    // freshly generated session is never left with a zero court cost.
    const { data } = await service
      .from('session_instances')
      .select('court_cost_share_fils, water_cost_fils')
      // Generated rows only. The seed's cancelled fixture carries a zero
      // snapshot on purpose, and a cancelled session is not part of the
      // division any more (12.1).
      .not('template_id', 'is', null)
      .neq('status', 'cancelled')
      .gte('session_date', await ammanToday())
      .limit(50);

    expect(data?.length).toBeGreaterThan(0);
    for (const row of data ?? []) {
      expect(row.court_cost_share_fils).toBeGreaterThan(0);
      // D75: 1.25 JD standard, 2.5 JD extended.
      expect([1250, 2500]).toContain(row.water_cost_fils);
    }
  });

  it('does not undo a coach’s edit on the next run', async () => {
    // D7 lets him move a single dated instance without touching the template.
    // Keyed on (venue, starts_at) the nightly run would see the template's
    // original slot empty and helpfully refill it.
    const today = await ammanToday();
    const { data: instance } = await service
      .from('session_instances')
      .select('id, template_id, session_date, starts_at, venue_id')
      .not('template_id', 'is', null)
      .gt('session_date', today)
      .order('session_date', { ascending: true })
      .limit(1)
      .single();

    const moved = addMinutes(parseInstant(String(instance?.starts_at)), 45);

    await service
      .from('session_instances')
      .update({ starts_at: moved.toISOString() })
      .eq('id', instance?.id ?? '');

    const { data: created } = await service.rpc('generate_sessions', { p_days_ahead: 21 });

    expect(created).toBe(0);

    const { count } = await service
      .from('session_instances')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', instance?.template_id ?? '')
      .eq('session_date', instance?.session_date ?? '');

    expect(count).toBe(1);
  });

  it('does not resurrect a session the coach cancelled', async () => {
    const { data: instance } = await service
      .from('session_instances')
      .select('id, template_id, session_date')
      .not('template_id', 'is', null)
      .eq('status', 'scheduled')
      .gt('session_date', await ammanToday())
      .order('session_date', { ascending: false })
      .limit(1)
      .single();

    await coach.rpc('cancel_session', { p_session_id: instance?.id ?? '' });

    const { data: created } = await service.rpc('generate_sessions', { p_days_ahead: 21 });
    expect(created).toBe(0);

    const { data: after } = await service
      .from('session_instances')
      .select('id, status')
      .eq('template_id', instance?.template_id ?? '')
      .eq('session_date', instance?.session_date ?? '');

    expect(after).toHaveLength(1);
    expect(after?.[0]?.status).toBe('cancelled');

    // Put the night back, so the suites that follow read the seeded schedule.
    await service
      .from('session_instances')
      .delete()
      .eq('id', after?.[0]?.id ?? '');
    await service.rpc('generate_sessions', { p_days_ahead: 21 });
  });

  it('refuses a negative horizon rather than doing something surprising', async () => {
    const { error } = await service.rpc('generate_sessions', { p_days_ahead: -1 });

    expect(error?.message).toContain('invalid_days_ahead');
  });

  it('is not callable by a player or by staff', async () => {
    // Generation runs from pg_cron. Nothing in the app calls it.
    const asPlayer = await player.rpc('generate_sessions', { p_days_ahead: 1 });
    const asCoach = await coach.rpc('generate_sessions', { p_days_ahead: 1 });

    expect(asPlayer.error).not.toBeNull();
    expect(asCoach.error).not.toBeNull();
  });
});

/**
 * 5.5: "IN_PROGRESS and PENDING_REVIEW are derived from timestamps by a
 * scheduled job, not by client polling."
 */
describe('advance_session_states', () => {
  let service: Client;

  beforeAll(() => {
    service = serviceClient();
  });

  it('moves a started session to in_progress and a finished one to review', async () => {
    const now = nowInAmman();
    const { data: venue } = await service
      .from('venues')
      .select('id')
      .eq('id', VENUES.shmeisani)
      .single();

    const running = {
      venue_id: venue?.id ?? '',
      session_date: now.toISOString().slice(0, 10),
      starts_at: addMinutes(now, -30).toISOString(),
      ends_at: addMinutes(now, 30).toISOString(),
      session_type: 'standard' as const,
      price_fils: 6000,
      court_count: 3,
      rotation_count: 4,
    };

    const finished = {
      ...running,
      starts_at: addMinutes(now, -180).toISOString(),
      ends_at: addMinutes(now, -90).toISOString(),
    };

    const { data: inserted, error } = await service
      .from('session_instances')
      .insert([running, finished])
      .select('id, status');

    expect(error).toBeNull();
    expect(inserted?.every((row) => row.status === 'scheduled')).toBe(true);

    const { error: jobError } = await service.rpc('advance_session_states');
    expect(jobError).toBeNull();

    const ids = (inserted ?? []).map((row) => row.id);
    const { data: after } = await service
      .from('session_instances')
      .select('id, status, starts_at')
      .in('id', ids)
      .order('starts_at', { ascending: true });

    expect(after?.[0]?.status).toBe('pending_review');
    expect(after?.[1]?.status).toBe('in_progress');

    await service.from('session_instances').delete().in('id', ids);
  });

  it('leaves a cancelled session alone', async () => {
    const now = nowInAmman();
    const { data: inserted } = await service
      .from('session_instances')
      .insert({
        venue_id: VENUES.shmeisani,
        session_date: now.toISOString().slice(0, 10),
        starts_at: addMinutes(now, -240).toISOString(),
        ends_at: addMinutes(now, -120).toISOString(),
        session_type: 'standard',
        price_fils: 6000,
        court_count: 3,
        rotation_count: 4,
        status: 'cancelled',
      })
      .select('id')
      .single();

    await service.rpc('advance_session_states');

    const { data: after } = await service
      .from('session_instances')
      .select('status')
      .eq('id', inserted?.id ?? '')
      .single();

    expect(after?.status).toBe('cancelled');

    await service
      .from('session_instances')
      .delete()
      .eq('id', inserted?.id ?? '');
  });
});
