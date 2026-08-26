import { parseInstant } from '../../src/lib/time';
import { serviceClient, signIn, type Client } from './helpers/clients';
import { offsetDayKey } from './helpers/dates';
import { SESSIONS, USERS, VENUES } from './helpers/fixtures';

/**
 * The three staff session mutations. BUILD-SPEC 15.4, 15.5, 15.6 and 9.4.
 *
 * The phase 3 acceptance criteria this file carries are "the capacity guard
 * blocks an unsafe reduction" and, from 9.4, that cancelling returns credits
 * and cancels bookings without notifying anybody.
 */
describe('session administration', () => {
  let coach: Client;
  let admin: Client;
  let player: Client;
  let service: Client;
  const created: string[] = [];

  beforeAll(async () => {
    [coach, admin, player] = await Promise.all([
      signIn(USERS.coach.email),
      signIn(USERS.admin.email),
      signIn(USERS.level0.email),
    ]);
    service = serviceClient();
  });

  afterEach(async () => {
    if (created.length > 0) {
      await service.from('session_instances').delete().in('id', created.splice(0));
    }
  });

  async function futureDate(offsetDays: number): Promise<string> {
    const { data } = await service.rpc('amman_today');
    return offsetDayKey(data as unknown as string, offsetDays);
  }

  async function makeSession(
    overrides: {
      venueId?: string;
      startTime?: string;
      durationMinutes?: 90 | 150;
      priceFils?: number;
      courtCount?: number;
      offsetDays?: number;
    } = {},
  ): Promise<string> {
    const { data, error } = await coach.rpc('create_one_off_session', {
      p_venue_id: overrides.venueId ?? VENUES.khalda,
      p_session_date: await futureDate(overrides.offsetDays ?? 40),
      p_start_time: overrides.startTime ?? '19:00',
      p_duration_minutes: overrides.durationMinutes ?? 90,
      p_price_fils: overrides.priceFils ?? 6000,
      p_court_count: overrides.courtCount ?? 4,
    });

    expect(error).toBeNull();
    created.push(data as unknown as string);
    return data as unknown as string;
  }

  // ── 15.6 ───────────────────────────────────────────────
  describe('create_one_off_session', () => {
    it('derives the type and the rotations from the duration', async () => {
      // D5: 90 minutes is standard with 4 rotations, 150 is extended with 6.
      const standard = await makeSession({ startTime: '17:00' });
      const extended = await makeSession({ startTime: '19:30', durationMinutes: 150 });

      const { data } = await service
        .from('session_instances')
        .select('id, session_type, rotation_count, template_id, capacity, ends_at, starts_at')
        .in('id', [standard, extended]);

      const standardRow = data?.find((row) => row.id === standard);
      const extendedRow = data?.find((row) => row.id === extended);

      expect(standardRow?.session_type).toBe('standard');
      expect(standardRow?.rotation_count).toBe(4);
      expect(extendedRow?.session_type).toBe('extended');
      expect(extendedRow?.rotation_count).toBe(6);
      // A one-off has no template. That is what makes it ad hoc, and it is
      // what keeps generate_sessions from treating it as a template's slot.
      expect(standardRow?.template_id).toBeNull();
      // 5.4: capacity is court_count x 4, and Postgres computes it.
      expect(standardRow?.capacity).toBe(16);
    });

    it('honours the rotation count when one is given', async () => {
      // A15: the coach may add a seventh rotation to an extended session.
      const { data: id, error } = await coach.rpc('create_one_off_session', {
        p_venue_id: VENUES.khalda,
        p_session_date: await futureDate(41),
        p_start_time: '18:30',
        p_duration_minutes: 150,
        p_price_fils: 8000,
        p_court_count: 4,
        p_rotation_count: 7,
      });

      expect(error).toBeNull();
      created.push(id as unknown as string);

      const { data } = await service
        .from('session_instances')
        .select('rotation_count')
        .eq('id', id as unknown as string)
        .single();

      expect(data?.rotation_count).toBe(7);
    });

    it('refuses a duration that is not 90 or 150', async () => {
      const { error } = await coach.rpc('create_one_off_session', {
        p_venue_id: VENUES.khalda,
        p_session_date: await futureDate(42),
        p_start_time: '19:00',
        p_duration_minutes: 120,
        p_price_fils: 6000,
        p_court_count: 4,
      });

      expect(error?.message).toContain('invalid_duration');
    });

    it('refuses a second session at the same venue and time', async () => {
      const date = await futureDate(43);
      const first = await coach.rpc('create_one_off_session', {
        p_venue_id: VENUES.khalda,
        p_session_date: date,
        p_start_time: '19:00',
        p_duration_minutes: 90,
        p_price_fils: 6000,
        p_court_count: 4,
      });
      created.push(first.data as unknown as string);

      const second = await coach.rpc('create_one_off_session', {
        p_venue_id: VENUES.khalda,
        p_session_date: date,
        p_start_time: '19:00',
        p_duration_minutes: 90,
        p_price_fils: 6000,
        p_court_count: 4,
      });

      expect(second.error?.message).toContain('session_time_taken');
    });

    it('lets an admin create one, and refuses a player', async () => {
      // D16: an admin can do everything the coach can except view reports.
      const { data: id, error } = await admin.rpc('create_one_off_session', {
        p_venue_id: VENUES.shmeisani,
        p_session_date: await futureDate(44),
        p_start_time: '19:30',
        p_duration_minutes: 90,
        p_price_fils: 6000,
        p_court_count: 3,
      });

      expect(error).toBeNull();
      created.push(id as unknown as string);

      const refused = await player.rpc('create_one_off_session', {
        p_venue_id: VENUES.shmeisani,
        p_session_date: await futureDate(45),
        p_start_time: '19:30',
        p_duration_minutes: 90,
        p_price_fils: 0,
        p_court_count: 3,
      });

      expect(refused.error?.message).toContain('not_authorized');
    });
  });

  // ── 15.4 ───────────────────────────────────────────────
  describe('update_session_instance and the capacity guard', () => {
    it('blocks a court reduction below the current bookings', async () => {
      // A3: the app never auto-removes anyone. It refuses the save.
      const { count: booked } = await service
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', SESSIONS.open)
        .eq('status', 'confirmed');

      expect(booked).toBeGreaterThan(0);

      const courtsThatCannotHold = Math.floor(((booked ?? 0) - 1) / 4);

      const { error } = await coach.rpc('update_session_instance', {
        p_session_id: SESSIONS.open,
        p_start_time: '19:00',
        p_duration_minutes: 90,
        p_price_fils: 6000,
        p_court_count: Math.max(1, courtsThatCannotHold),
      });

      expect(error?.message).toContain('capacity_below_bookings');
    });

    it('removes nobody when it refuses', async () => {
      const before = await service
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', SESSIONS.open)
        .eq('status', 'confirmed');

      await coach.rpc('update_session_instance', {
        p_session_id: SESSIONS.open,
        p_start_time: '19:00',
        p_duration_minutes: 90,
        p_price_fils: 6000,
        p_court_count: 1,
      });

      const after = await service
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', SESSIONS.open)
        .eq('status', 'confirmed');

      expect(after.count).toBe(before.count);
    });

    it('allows a reduction that still holds everybody', async () => {
      const id = await makeSession({ courtCount: 4 });

      const { error } = await coach.rpc('update_session_instance', {
        p_session_id: id,
        p_start_time: '19:00',
        p_duration_minutes: 90,
        p_price_fils: 6000,
        p_court_count: 2,
      });

      expect(error).toBeNull();

      const { data } = await service
        .from('session_instances')
        .select('court_count, capacity')
        .eq('id', id)
        .single();

      expect(data?.court_count).toBe(2);
      expect(data?.capacity).toBe(8);
    });

    it('re-derives both timestamps when the start time moves', async () => {
      const id = await makeSession({ startTime: '19:00' });

      await coach.rpc('update_session_instance', {
        p_session_id: id,
        p_start_time: '20:30',
        p_duration_minutes: 90,
        p_price_fils: 6000,
        p_court_count: 4,
      });

      const { data } = await service
        .from('session_instances')
        .select('starts_at, ends_at')
        .eq('id', id)
        .single();

      // 20:30 Amman is 17:30 UTC. Every cutoff moves with it.
      const starts = parseInstant(String(data?.starts_at));
      expect(starts.getUTCHours()).toBe(17);
      expect(starts.getUTCMinutes()).toBe(30);
      expect(parseInstant(String(data?.ends_at)).getTime() - starts.getTime()).toBe(90 * 60 * 1000);
    });

    it('flips the type, the rotations and the water cost when the duration changes', async () => {
      const id = await makeSession({ startTime: '18:30' });

      await coach.rpc('update_session_instance', {
        p_session_id: id,
        p_start_time: '18:30',
        p_duration_minutes: 150,
        p_price_fils: 8000,
        p_court_count: 4,
      });

      const { data } = await service
        .from('session_instances')
        .select('session_type, rotation_count, water_cost_fils')
        .eq('id', id)
        .single();

      expect(data?.session_type).toBe('extended');
      expect(data?.rotation_count).toBe(6);
      expect(data?.water_cost_fils).toBe(2500);
    });

    it('leaves a hand-set rotation count alone when only the time moves', async () => {
      // A15: he may add a seventh rotation by hand, and nudging the start time
      // is not a reason to take it away.
      const id = await makeSession({ startTime: '18:30', durationMinutes: 150 });
      await service.from('session_instances').update({ rotation_count: 7 }).eq('id', id);

      await coach.rpc('update_session_instance', {
        p_session_id: id,
        p_start_time: '19:00',
        p_duration_minutes: 150,
        p_price_fils: 8000,
        p_court_count: 4,
      });

      const { data } = await service
        .from('session_instances')
        .select('rotation_count')
        .eq('id', id)
        .single();

      expect(data?.rotation_count).toBe(7);
    });

    it('never rewrites the price on an existing booking', async () => {
      // A7: every booking snapshotted expected_fils when it was made.
      const before = await service
        .from('bookings')
        .select('id, expected_fils')
        .eq('session_id', SESSIONS.open)
        .order('id', { ascending: true });

      // 16:15 rather than 19:00. Every Khalda template starts at 18:30, 19:00
      // or 20:30 (3.1), and SESSIONS.open is on today + 1 — so on any day whose
      // tomorrow is a Saturday or a Thursday, moving it to 19:00 collides with
      // a seeded session and `session_time_taken` is raised. The test then read
      // an unchanged price and blamed the price rule. The error is asserted for
      // the same reason: a refused edit must fail here rather than downstream.
      const { error: updateError } = await coach.rpc('update_session_instance', {
        p_session_id: SESSIONS.open,
        p_start_time: '16:15',
        p_duration_minutes: 90,
        p_price_fils: 9000,
        p_court_count: 4,
      });
      expect(updateError).toBeNull();

      const after = await service
        .from('bookings')
        .select('id, expected_fils')
        .eq('session_id', SESSIONS.open)
        .order('id', { ascending: true });

      expect(after.data).toEqual(before.data);

      const { data: session } = await service
        .from('session_instances')
        .select('price_fils')
        .eq('id', SESSIONS.open)
        .single();
      expect(session?.price_fils).toBe(9000);

      await service.from('session_instances').update({ price_fils: 6000 }).eq('id', SESSIONS.open);
    });

    it('refuses every edit once the session is locked', async () => {
      const id = await makeSession({ startTime: '17:30' });
      await service.from('session_instances').update({ status: 'locked' }).eq('id', id);

      const { error } = await coach.rpc('update_session_instance', {
        p_session_id: id,
        p_start_time: '18:00',
        p_duration_minutes: 90,
        p_price_fils: 6000,
        p_court_count: 4,
      });

      expect(error?.message).toContain('session_locked');
    });

    it('refuses a player', async () => {
      const { error } = await player.rpc('update_session_instance', {
        p_session_id: SESSIONS.open,
        p_start_time: '19:00',
        p_duration_minutes: 90,
        p_price_fils: 0,
        p_court_count: 4,
      });

      expect(error?.message).toContain('not_authorized');
    });
  });

  // ── 9.4 and 15.5 ───────────────────────────────────────
  describe('cancel_session', () => {
    it('cancels every confirmed booking and keeps them for the record', async () => {
      // 5.5: "CANCELLED sessions keep their bookings for the record, all
      // marked CANCELLED_BY_ADMIN."
      const sessionId = await makeSession({
        startTime: '12:00',
        venueId: VENUES.shmeisani,
        offsetDays: 46,
      });

      await service.from('bookings').insert({
        session_id: sessionId,
        attendee_kind: 'guest',
        guest_name: 'Walk-in',
        guest_tier: 'B',
        payment_method: 'cash',
        expected_fils: 6000,
        created_by: USERS.coach.id,
      });

      const { error } = await coach.rpc('cancel_session', {
        p_session_id: sessionId,
        p_note: 'The hall flooded.',
      });
      expect(error).toBeNull();

      const { data: after } = await service
        .from('session_instances')
        .select('status, cancellation_note, cancelled_by, cancelled_at')
        .eq('id', sessionId)
        .single();

      expect(after?.status).toBe('cancelled');
      expect(after?.cancellation_note).toBe('The hall flooded.');
      expect(after?.cancelled_by).toBe(USERS.coach.id);
      expect(after?.cancelled_at).not.toBeNull();

      const { data: bookings } = await service
        .from('bookings')
        .select('status')
        .eq('session_id', sessionId);

      expect(bookings?.length).toBeGreaterThan(0);
      expect(bookings?.every((row) => row.status === 'cancelled_by_admin')).toBe(true);
    });

    it('returns every credit, whatever the hour', async () => {
      // 9.4 step 3, and A2: the credit goes back to the subscription it came
      // from even if that has since expired.
      const id = await makeSession({ startTime: '16:00', venueId: VENUES.shmeisani });

      const { data: subscription } = await service
        .from('player_subscriptions')
        .select('id, player_id')
        .eq('is_voided', false)
        .limit(1)
        .single();

      const subscriptionId = subscription?.id ?? '';
      const playerId = subscription?.player_id ?? '';

      const before = await service
        .from('credit_transactions')
        .select('delta')
        .eq('subscription_id', subscriptionId);
      const balanceBefore = (before.data ?? []).reduce((sum, row) => sum + row.delta, 0);

      const { data: booking } = await service
        .from('bookings')
        .insert({
          session_id: id,
          attendee_kind: 'player',
          player_id: playerId,
          payment_method: 'credit',
          payment_status: 'paid',
          expected_fils: 0,
          created_by: playerId,
        })
        .select('id')
        .single();

      const { data: txn } = await service
        .from('credit_transactions')
        .insert({
          subscription_id: subscriptionId,
          player_id: playerId,
          delta: -1,
          reason: 'booking',
          booking_id: booking?.id ?? '',
        })
        .select('id')
        .single();

      await service
        .from('bookings')
        .update({ credit_txn_id: txn?.id ?? '' })
        .eq('id', booking?.id ?? '');

      await coach.rpc('cancel_session', { p_session_id: id });

      const after = await service
        .from('credit_transactions')
        .select('delta, reason')
        .eq('subscription_id', subscriptionId);
      const balanceAfter = (after.data ?? []).reduce((sum, row) => sum + row.delta, 0);

      // Spent one, got it back: the balance is where it started.
      expect(balanceAfter).toBe(balanceBefore);
      expect(after.data?.some((row) => row.reason === 'session_cancelled' && row.delta === 1)).toBe(
        true,
      );
    });

    it('records nothing financial for a cash or CliQ booking', async () => {
      // 9.4 step 4, and 10.3: "A balance entry is created only by
      // record_payment, and only from the review screen."
      const id = await makeSession({ startTime: '15:00', venueId: VENUES.shmeisani });
      await service.from('bookings').insert({
        session_id: id,
        attendee_kind: 'guest',
        guest_name: 'Cash guest',
        guest_tier: 'B',
        payment_method: 'cash',
        expected_fils: 6000,
        created_by: USERS.coach.id,
      });

      const before = await service
        .from('balance_entries')
        .select('id', { count: 'exact', head: true });

      await coach.rpc('cancel_session', { p_session_id: id });

      const after = await service
        .from('balance_entries')
        .select('id', { count: 'exact', head: true });

      expect(after.count).toBe(before.count);
    });

    it('refuses to cancel a session that has already ended', async () => {
      // 5.5 allows the transition only from scheduled or in_progress.
      const id = await makeSession({ startTime: '14:00', venueId: VENUES.shmeisani });
      await service.from('session_instances').update({ status: 'pending_review' }).eq('id', id);

      const { error } = await coach.rpc('cancel_session', { p_session_id: id });

      expect(error?.message).toContain('session_not_open');
    });

    it('refuses a player', async () => {
      const { error } = await player.rpc('cancel_session', { p_session_id: SESSIONS.open });
      expect(error?.message).toContain('not_authorized');
    });

    it('lets an admin cancel', async () => {
      // D16 again: deleting sessions is on the admin's list.
      const id = await makeSession({ startTime: '13:00', venueId: VENUES.shmeisani });

      const { error } = await admin.rpc('cancel_session', { p_session_id: id });

      expect(error).toBeNull();
    });
  });
});
