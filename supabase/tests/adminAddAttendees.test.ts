/**
 * The coach adds people. BUILD-SPEC 15.2, D22, D30, D42 to D47.
 *
 * Three paths, three shapes of booking, one rule they all share: capacity is
 * hard (D30). The coach may add somebody after the cutoff and during the
 * session — D22 — but never a seventeenth player onto four courts.
 */
import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS, VENUES } from './helpers/fixtures';
import {
  bookingRow,
  cleanupFixtures,
  createBookingRow,
  createSession,
  fillSession,
  grantSubscription,
  remainingCredits,
  seededPlayer,
} from './helpers/bookingFixtures';

const SUBJECT = seededPlayer(39);

let coach: Client;
let admin: Client;
let player: Client;

beforeAll(async () => {
  [coach, admin, player] = await Promise.all([
    signIn(USERS.coach.email),
    signIn(USERS.admin.email),
    signIn(seededPlayer(20).email),
  ]);
}, 60000);

afterAll(async () => {
  await cleanupFixtures();
});

describe('add a registered player, by name search', () => {
  it('finds him by part of his name, with his tier and his credits', async () => {
    // 15.2: "results showing name, tier, and credit balance".
    const session = await createSession({ startsInMinutes: 5 * 60 });
    await grantSubscription(SUBJECT.id, 8);

    const { data, error } = await coach.rpc('search_players_for_session', {
      p_query: 'Number039',
      p_session_id: session.id,
    });

    expect(error).toBeNull();
    const hit = data?.find((row) => row.player_id === SUBJECT.id);
    expect(hit).toMatchObject({ display_name: 'Player Number039', credits: 8, is_booked: false });
    expect(hit?.credit_expires).not.toBeNull();
  });

  it('says nothing for a one character query', async () => {
    // 15.2: "minimum 2 characters".
    const session = await createSession({ startsInMinutes: 5 * 60 + 5 });
    const { data } = await coach.rpc('search_players_for_session', {
      p_query: 'P',
      p_session_id: session.id,
    });

    expect(data).toEqual([]);
  });

  it('flags a player who already has a spot rather than hiding him', async () => {
    // 15.2: "Blocked if he is already booked, with the reason shown."
    const session = await createSession({ startsInMinutes: 5 * 60 + 10 });
    await createBookingRow({ sessionId: session.id, playerId: SUBJECT.id });

    const { data } = await coach.rpc('search_players_for_session', {
      p_query: 'Number039',
      p_session_id: session.id,
    });

    expect(data?.find((row) => row.player_id === SUBJECT.id)?.is_booked).toBe(true);
  });

  it('is refused to a player', async () => {
    const session = await createSession({ startsInMinutes: 5 * 60 + 15 });
    const { error } = await player.rpc('search_players_for_session', {
      p_query: 'Number',
      p_session_id: session.id,
    });

    expect(error?.message.trim()).toBe('not_authorized');
  });

  it('takes a credit when he has one, without him doing anything', async () => {
    // D42 and D43. He never logs in; the coach adds him.
    const session = await createSession({ startsInMinutes: 6 * 60 });
    const subject = seededPlayer(21);
    const subscription = await grantSubscription(subject.id, 8);

    const { data: bookingId, error } = await coach.rpc('admin_add_player', {
      p_session_id: session.id,
      p_player_id: subject.id,
    });
    expect(error).toBeNull();

    expect(await remainingCredits(subscription)).toBe(7);
    expect(await bookingRow(bookingId as string)).toMatchObject({
      payment_method: 'credit',
      payment_status: 'paid',
      expected_fils: 0,
      source: 'admin_added',
      attendee_kind: 'player',
    });
  });

  it('creates a cash booking marked paid when he has no credits', async () => {
    // D43: "the booking is created as cash and marked paid, editable during
    // review".
    const session = await createSession({ startsInMinutes: 6 * 60 + 5 });
    const subject = seededPlayer(22);

    const { data: bookingId, error } = await coach.rpc('admin_add_player', {
      p_session_id: session.id,
      p_player_id: subject.id,
    });
    expect(error).toBeNull();

    expect(await bookingRow(bookingId as string)).toMatchObject({
      payment_method: 'cash',
      payment_status: 'paid',
      expected_fils: 6000,
      paid_fils: 6000,
    });
  });

  it('lets the coach choose cash even when the player has credits', async () => {
    // 15.2 offers "Cash instead" as the alternative to the preselected credit.
    const session = await createSession({ startsInMinutes: 6 * 60 + 10 });
    const subject = seededPlayer(23);
    const subscription = await grantSubscription(subject.id, 8);

    const { data: bookingId } = await coach.rpc('admin_add_player', {
      p_session_id: session.id,
      p_player_id: subject.id,
      p_use_credit: false,
    });

    expect(await remainingCredits(subscription)).toBe(8);
    expect((await bookingRow(bookingId as string)).payment_method).toBe('cash');
  });

  it('refuses credit when there is none -> no_credits_available', async () => {
    const session = await createSession({ startsInMinutes: 6 * 60 + 15 });
    const { error } = await coach.rpc('admin_add_player', {
      p_session_id: session.id,
      p_player_id: seededPlayer(24).id,
      p_use_credit: true,
    });

    expect(error?.message.trim()).toBe('no_credits_available');
  });

  it('waives a player whose custom rate is zero', async () => {
    // D41 and 12.2 rule 2: he takes a slot and contributes no revenue.
    const session = await createSession({ startsInMinutes: 6 * 60 + 20 });
    const { data: bookingId } = await coach.rpc('admin_add_player', {
      p_session_id: session.id,
      p_player_id: seededPlayer(5).id,
    });

    expect(await bookingRow(bookingId as string)).toMatchObject({
      expected_fils: 0,
      payment_status: 'waived',
    });
  });

  it('refuses a second booking for the same player -> already_booked', async () => {
    const session = await createSession({ startsInMinutes: 6 * 60 + 25 });
    const subject = seededPlayer(25);
    await coach.rpc('admin_add_player', { p_session_id: session.id, p_player_id: subject.id });

    const { error } = await coach.rpc('admin_add_player', {
      p_session_id: session.id,
      p_player_id: subject.id,
    });
    expect(error?.message.trim()).toBe('already_booked');
  });

  it('works after the cutoff and during the session, per D22', async () => {
    const afterCutoff = await createSession({ startsInMinutes: 20 });
    const during = await createSession({ startsInMinutes: -15, status: 'in_progress' });

    const late = await coach.rpc('admin_add_player', {
      p_session_id: afterCutoff.id,
      p_player_id: seededPlayer(26).id,
    });
    const mid = await coach.rpc('admin_add_player', {
      p_session_id: during.id,
      p_player_id: seededPlayer(27).id,
    });

    expect(late.error).toBeNull();
    expect(mid.error).toBeNull();
  });

  it('still refuses to oversell -> session_full', async () => {
    // D30: no overselling under any circumstance. Not even for the coach.
    const session = await createSession({ startsInMinutes: 7 * 60, courtCount: 1 });
    await fillSession(session.id, 4);

    const { error } = await coach.rpc('admin_add_player', {
      p_session_id: session.id,
      p_player_id: seededPlayer(28).id,
    });
    expect(error?.message.trim()).toBe('session_full');
  });

  it('is refused to a player -> not_authorized', async () => {
    const session = await createSession({ startsInMinutes: 7 * 60 + 5 });
    const { error } = await player.rpc('admin_add_player', {
      p_session_id: session.id,
      p_player_id: seededPlayer(29).id,
    });

    expect(error?.message.trim()).toBe('not_authorized');
  });

  it('takes the added player off that session’s waiting list', async () => {
    const session = await createSession({ startsInMinutes: 7 * 60 + 10, courtCount: 1 });
    const subject = seededPlayer(30);
    await fillSession(session.id, 4);
    await serviceClient()
      .from('waitlist_entries')
      .insert({ session_id: session.id, player_id: subject.id });

    // A spot opens, and the coach fills it himself. D28's case.
    const { data: filler } = await serviceClient()
      .from('bookings')
      .select('id')
      .eq('session_id', session.id)
      .limit(1)
      .single();
    await serviceClient()
      .from('bookings')
      .update({ status: 'cancelled_by_admin' })
      .eq('id', filler?.id ?? '');

    await coach.rpc('admin_add_player', { p_session_id: session.id, p_player_id: subject.id });

    const { data } = await serviceClient()
      .from('waitlist_entries')
      .select('id')
      .eq('session_id', session.id)
      .eq('player_id', subject.id);
    expect(data).toEqual([]);
  });
});

describe('add a guest', () => {
  it('creates a paid guest at the session price', async () => {
    // D44 and D45. Name and tier only, and an amount.
    const session = await createSession({ startsInMinutes: 8 * 60 });
    const { data: bookingId, error } = await admin.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: '  Sami  ',
      p_guest_tier: 'B+',
      p_is_free: false,
    });

    expect(error).toBeNull();
    expect(await bookingRow(bookingId as string)).toMatchObject({
      attendee_kind: 'guest',
      guest_name: 'Sami',
      payment_method: 'cash',
      payment_status: 'paid',
      expected_fils: 6000,
      paid_fils: 6000,
      source: 'admin_added',
    });
  });

  it('creates a free guest who contributes no revenue', async () => {
    // D45 and 12.2 rule 2: "Free guests fill empty spots and contribute no
    // revenue."
    const session = await createSession({ startsInMinutes: 8 * 60 + 5 });
    const { data: bookingId } = await admin.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: 'Free Friend',
      p_guest_tier: 'C',
      p_is_free: true,
    });

    expect(await bookingRow(bookingId as string)).toMatchObject({
      payment_method: 'free',
      payment_status: 'waived',
      expected_fils: 0,
      paid_fils: 0,
    });
  });

  it('takes an amount other than the session price', async () => {
    const session = await createSession({ startsInMinutes: 8 * 60 + 10 });
    const { data: bookingId } = await admin.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: 'Half Price',
      p_guest_tier: 'B',
      p_is_free: false,
      p_amount_fils: 3000,
    });

    expect((await bookingRow(bookingId as string)).expected_fils).toBe(3000);
  });

  it('refuses a blank name', async () => {
    const session = await createSession({ startsInMinutes: 8 * 60 + 15 });
    const { error } = await admin.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: '   ',
      p_guest_tier: 'B',
      p_is_free: true,
    });

    expect(error?.message.trim()).toBe('guest_name_required');
  });

  it('counts toward capacity like anybody else', async () => {
    // 5.4: "Guest bookings do [count]."
    const session = await createSession({ startsInMinutes: 8 * 60 + 20, courtCount: 1 });
    await fillSession(session.id, 4);

    const { error } = await admin.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: 'One Too Many',
      p_guest_tier: 'B',
      p_is_free: true,
    });
    expect(error?.message.trim()).toBe('session_full');
  });

  it('remembers nothing about him for next time', async () => {
    // D46: guests are not remembered. No autocomplete, no history, no merging.
    // The search over registered players is the only lookup there is, and it
    // does not see guests.
    const session = await createSession({ startsInMinutes: 8 * 60 + 25 });
    await admin.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: 'Ghassan Memorable',
      p_guest_tier: 'A',
      p_is_free: true,
    });

    const { data } = await coach.rpc('search_players_for_session', {
      p_query: 'Ghassan',
      p_session_id: session.id,
    });
    expect(data).toEqual([]);
  });
});

describe('add an assistant coach', () => {
  it('offers the coaches, and warns when one is already on that night', async () => {
    // 15.2: "warns when that coach is already on another session the same
    // night: 'Already added tonight. The 10 JD fee is counted once.'" D76.
    const date = '2026-12-01';
    const first = await createSession({
      startsInMinutes: 30 * 60,
      sessionDate: date,
      venueId: VENUES.shmeisani,
      courtCount: 3,
    });
    const second = await createSession({
      startsInMinutes: 32 * 60,
      sessionDate: date,
      venueId: VENUES.shmeisani,
      courtCount: 3,
    });

    await coach.rpc('admin_add_coach', {
      p_session_id: first.id,
      p_coach_id: USERS.assistant.id,
      p_is_paid: false,
    });

    const { data } = await coach.rpc('list_coach_options', { p_session_id: second.id });
    const assistant = data?.find((row) => row.coach_id === USERS.assistant.id);

    expect(assistant?.is_on_session).toBe(false);
    expect(assistant?.is_on_night).toBe(true);
  });

  it('gives him a court slot he pays nothing for', async () => {
    // D47: "They occupy a court slot and pay nothing."
    const session = await createSession({ startsInMinutes: 9 * 60 });
    const { data: bookingId, error } = await coach.rpc('admin_add_coach', {
      p_session_id: session.id,
      p_coach_id: USERS.assistant.id,
      p_is_paid: false,
    });

    expect(error).toBeNull();
    expect(await bookingRow(bookingId as string)).toMatchObject({
      attendee_kind: 'coach',
      is_coach_slot: true,
      payment_method: 'free',
      payment_status: 'waived',
      expected_fils: 0,
    });
  });

  it('records the night’s fee once, however many sessions he plays', async () => {
    // D76: 10 JD per day, not per session. The night key is venue and date.
    const date = '2026-12-08';
    const first = await createSession({
      startsInMinutes: 40 * 60,
      sessionDate: date,
      venueId: VENUES.khalda,
    });
    const second = await createSession({
      startsInMinutes: 42 * 60,
      sessionDate: date,
      venueId: VENUES.khalda,
    });

    await coach.rpc('admin_add_coach', {
      p_session_id: first.id,
      p_coach_id: USERS.assistant.id,
      p_is_paid: true,
    });
    await coach.rpc('admin_add_coach', {
      p_session_id: second.id,
      p_coach_id: USERS.assistant.id,
      p_is_paid: true,
    });

    const { data } = await serviceClient()
      .from('session_instances')
      .select('id, coach_fee_share_fils')
      .in('id', [first.id, second.id]);

    const total = (data ?? []).reduce((sum, row) => sum + row.coach_fee_share_fils, 0);
    expect(total).toBe(10000);
  });

  it('marks the fee paid or unpaid, which is what the toggle is for', async () => {
    // D17: "The main coach adds them to a session and marks each paid or
    // unpaid." That is about the fee the academy owes him.
    const session = await createSession({ startsInMinutes: 9 * 60 + 10 });
    await coach.rpc('admin_add_coach', {
      p_session_id: session.id,
      p_coach_id: USERS.assistant.id,
      p_is_paid: true,
    });

    const { data } = await serviceClient()
      .from('session_coaches')
      .select('is_paid, paid_at, night_key')
      .eq('session_id', session.id)
      .single();

    expect(data?.is_paid).toBe(true);
    expect(data?.paid_at).not.toBeNull();
    expect(data?.night_key).toContain(VENUES.khalda);
  });

  it('refuses somebody who is not a coach -> not_a_coach', async () => {
    const session = await createSession({ startsInMinutes: 9 * 60 + 15 });
    const { error } = await coach.rpc('admin_add_coach', {
      p_session_id: session.id,
      p_coach_id: seededPlayer(31).id,
    });

    expect(error?.message.trim()).toBe('not_a_coach');
  });

  it('takes the session_coaches row away again when he is removed', async () => {
    // A night of its own, so the fee share is this session's alone: the
    // seeded assistant is on every Khalda Saturday, and D76 counts him once
    // across whatever else is on that night.
    const session = await createSession({
      startsInMinutes: 50 * 60,
      sessionDate: '2026-12-15',
      venueId: VENUES.shmeisani,
      courtCount: 3,
    });
    const { data: bookingId } = await coach.rpc('admin_add_coach', {
      p_session_id: session.id,
      p_coach_id: USERS.assistant.id,
      p_is_paid: false,
    });

    await coach.rpc('admin_remove_booking', { p_booking_id: bookingId as string });

    const { data } = await serviceClient()
      .from('session_coaches')
      .select('id')
      .eq('session_id', session.id);

    expect(data).toEqual([]);

    // 12.1: the night's fee is recomputed, and with nobody left on it there
    // is nothing to divide.
    const { data: after } = await serviceClient()
      .from('session_instances')
      .select('coach_fee_share_fils, assistant_coach_count')
      .eq('id', session.id)
      .single();

    expect(after).toMatchObject({ coach_fee_share_fils: 0, assistant_coach_count: 0 });
  });
});

describe('the staff roster read behind the players tab', () => {
  it('gives staff every attendee with the payment method, and a player none', async () => {
    // 15.2's players tab reads the table directly: staff have full access
    // (7.3) and a player has only his own rows, which is why the same query
    // returns one row for him.
    const session = await createSession({ startsInMinutes: 10 * 60 });
    await coach.rpc('admin_add_guest', {
      p_session_id: session.id,
      p_guest_name: 'Roster Guest',
      p_guest_tier: 'B',
      p_is_free: true,
    });
    await createBookingRow({ sessionId: session.id, playerId: seededPlayer(20).id });

    const staffView = await coach
      .from('bookings')
      .select('id, payment_method, guest_name')
      .eq('session_id', session.id)
      .eq('status', 'confirmed');
    expect(staffView.data).toHaveLength(2);

    const playerView = await player
      .from('bookings')
      .select('id')
      .eq('session_id', session.id)
      .eq('status', 'confirmed');
    expect(playerView.data).toHaveLength(1);
  });
});
