/**
 * Phase 4 fixtures: sessions positioned relative to *now* rather than to a
 * calendar day.
 *
 * The seed's four fixture sessions all start at 17:00 on a fixed offset from
 * today, which is what phase 1's visibility tests needed. Phase 4 needs
 * something else: a session starting in 2 hours 59 minutes, and another in 3
 * hours 1 minute, so that D23's boundary can be tested from both sides without
 * moving anybody's clock. BUILD-SPEC 5.1 makes the server the authority on
 * time, so the only honest way to test a deadline is to place the session
 * either side of it and let `now()` be real.
 *
 * Everything created here is torn down afterwards. Nothing touches the seeded
 * fixtures, so the phase 1 to 3 suites still pass alongside.
 */
import { addDays, addMinutes } from 'date-fns';

import { ammanDayKey, nowInAmman } from '../../../src/lib/time';
import { serviceClient } from './clients';
import { sql } from './sql';
import { VENUES } from './fixtures';

export interface SessionFixtureOptions {
  /** Minutes from now until the session starts. Negative is in the past. */
  startsInMinutes: number;
  /** Capacity is courts × 4. D3. */
  courtCount?: number;
  durationMinutes?: 90 | 150;
  priceFils?: number;
  status?: 'scheduled' | 'in_progress' | 'pending_review' | 'confirmed' | 'locked' | 'cancelled';
  venueId?: string;
  /** Overrides the Amman calendar day the row carries, as `yyyy-MM-dd`. */
  sessionDate?: string;
}

export interface SessionFixture {
  id: string;
  startsAt: Date;
  capacity: number;
  priceFils: number;
}

/**
 * The seeded dev players, by number. Section 22 makes forty of them,
 * `playerNNN@pob.test`, all with the same password. Numbers 1, 7, 8, 9 and 10
 * carry subscriptions and 4, 5 and 6 carry custom rates, so the phase 4 suite
 * works from 20 upwards where a player is nothing but a player.
 */
export function seededPlayer(n: number): { email: string; id: string } {
  const padded = String(n).padStart(3, '0');
  return {
    email: `player${padded}@pob.test`,
    id: `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`,
  };
}

const createdSessions: string[] = [];
const createdBookings: string[] = [];
const createdSubscriptions: string[] = [];

/**
 * A session at a real instant. `session_date` is derived from the start in
 * Amman, because that is what the column means and what every window guard
 * compares against.
 */
export async function createSession(options: SessionFixtureOptions): Promise<SessionFixture> {
  const admin = serviceClient();
  const courtCount = options.courtCount ?? 4;
  const durationMinutes = options.durationMinutes ?? 90;
  const priceFils = options.priceFils ?? 6000;
  // 5.1: instants, built from the sanctioned clock rather than from `new
  // Date()`. Placing a session relative to a real now is the only way to test
  // a deadline without moving anybody's clock.
  const startsAt = addMinutes(nowInAmman(), options.startsInMinutes);
  const endsAt = addMinutes(startsAt, durationMinutes);

  const { data, error } = await admin
    .from('session_instances')
    .insert({
      template_id: null,
      venue_id: options.venueId ?? VENUES.khalda,
      session_date: options.sessionDate ?? ammanDayKey(startsAt),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      session_type: durationMinutes === 150 ? 'extended' : 'standard',
      price_fils: priceFils,
      court_count: courtCount,
      rotation_count: durationMinutes === 150 ? 6 : 4,
      status: options.status ?? 'scheduled',
    })
    .select('id, capacity')
    .single();

  if (error) throw new Error(`Could not create a session fixture: ${error.message}`);

  createdSessions.push(data.id);
  return { id: data.id, startsAt, capacity: data.capacity ?? courtCount * 4, priceFils };
}

/** Fills a session to within `spotsLeft` of capacity with guest bookings. */
export async function fillSession(
  sessionId: string,
  count: number,
  priceFils = 6000,
): Promise<void> {
  if (count <= 0) return;
  const admin = serviceClient();

  const rows = Array.from({ length: count }, (_, index) => ({
    session_id: sessionId,
    attendee_kind: 'guest' as const,
    guest_name: `Filler ${String(index + 1)}`,
    guest_tier: 'B' as const,
    tier_snapshot: 'B' as const,
    status: 'confirmed' as const,
    source: 'admin_added' as const,
    payment_method: 'cash' as const,
    payment_status: 'paid' as const,
    expected_fils: priceFils,
    paid_fils: priceFils,
  }));

  const { data, error } = await admin.from('bookings').insert(rows).select('id');
  if (error) throw new Error(`Could not fill a session fixture: ${error.message}`);
  createdBookings.push(...data.map((row) => row.id));
}

export interface PlayerBookingOptions {
  sessionId: string;
  playerId: string;
  method?: 'cash' | 'cliq' | 'credit' | 'free';
  expectedFils?: number;
  subscriptionId?: string;
}

async function plainBookingRow(
  admin: ReturnType<typeof serviceClient>,
  options: PlayerBookingOptions,
  method: 'cash' | 'credit' | 'free',
  expected: number,
): Promise<string> {
  const { data, error } = await admin
    .from('bookings')
    .insert({
      session_id: options.sessionId,
      attendee_kind: 'player',
      player_id: options.playerId,
      status: 'confirmed',
      source: 'self',
      payment_method: method,
      payment_status: method === 'credit' ? 'paid' : 'unpaid',
      expected_fils: expected,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Could not create a booking fixture: ${error.message}`);
  return data.id;
}

/** The booking and its proof in one statement, and therefore one transaction. */
function cliqBookingRow(options: PlayerBookingOptions, expected: number): string {
  const id = sql(`
    WITH b AS (
      INSERT INTO bookings (session_id, attendee_kind, player_id, status, source,
                            payment_method, payment_status, expected_fils)
      VALUES ('${options.sessionId}', 'player', '${options.playerId}', 'confirmed', 'self',
              'cliq', 'unpaid', ${String(expected)})
      RETURNING id
    ), p AS (
      INSERT INTO payment_proofs (booking_id, storage_path, file_size_bytes, mime_type)
      SELECT b.id, '${options.playerId}/' || b.id::text || '.jpg', 120000, 'image/jpeg'
      FROM b
    )
    SELECT id FROM b`);

  if (id === '') throw new Error('Could not create a CliQ booking fixture.');
  return id;
}

/** A confirmed booking, arranged rather than created through create_booking. */
export async function createBookingRow(options: PlayerBookingOptions): Promise<string> {
  const admin = serviceClient();
  const method = options.method ?? 'cash';
  const expected = method === 'credit' ? 0 : (options.expectedFils ?? 6000);

  // 10.1, enforced by the deferred constraint trigger in migration 0025: a
  // booking with payment_method = 'cliq' may not exist without a proof row.
  // The check runs at COMMIT, and PostgREST commits every request on its own,
  // so a booking insert followed by a proof insert is two transactions and the
  // first one aborts. That is the invariant working, not a fixture problem:
  // the only way to make a CliQ booking is to make both rows at once, which is
  // what create_cliq_booking does in the app and what this does here.
  const bookingId =
    method === 'cliq'
      ? cliqBookingRow(options, expected)
      : await plainBookingRow(admin, options, method, expected);

  createdBookings.push(bookingId);
  const data = { id: bookingId };

  if (method === 'credit' && options.subscriptionId !== undefined) {
    const { data: txn, error: txnError } = await admin
      .from('credit_transactions')
      .insert({
        subscription_id: options.subscriptionId,
        player_id: options.playerId,
        delta: -1,
        reason: 'booking',
        booking_id: data.id,
      })
      .select('id')
      .single();

    if (txnError) throw new Error(`Could not create a credit fixture: ${txnError.message}`);
    await admin.from('bookings').update({ credit_txn_id: txn.id }).eq('id', data.id);
  }

  return data.id;
}

/**
 * A subscription with `visits` credits on it, expiring `days` from today.
 *
 * `days = 0` is a subscription expiring *today*, which pick_subscription still
 * accepts (`expires_on >= amman_today()`) and the expiry job still leaves
 * alone. A negative `days` gives an already expired one. Both need a start
 * date behind the expiry: `CHECK (expires_on > starts_on)` in section 6.2, so
 * the start is today only when there is at least a day between them.
 */
export async function grantSubscription(
  playerId: string,
  visits = 8,
  days = 30,
  packageVisits = 8,
): Promise<string> {
  const admin = serviceClient();

  const { data: pkg, error: pkgError } = await admin
    .from('packages')
    .select('id, per_visit_fils')
    .eq('visit_count', packageVisits)
    .single();
  if (pkgError) throw new Error(pkgError.message);

  const today = nowInAmman();
  const expires = addDays(today, days);
  const starts = days >= 1 ? today : addDays(expires, -1);

  const { data, error } = await admin
    .from('player_subscriptions')
    .insert({
      player_id: playerId,
      package_id: pkg.id,
      granted_visits: visits,
      per_visit_fils: pkg.per_visit_fils ?? 5000,
      starts_on: ammanDayKey(starts),
      expires_on: ammanDayKey(expires),
      granted_by: playerId,
      note: 'test fixture',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Could not grant a subscription fixture: ${error.message}`);
  createdSubscriptions.push(data.id);

  const { error: txnError } = await admin.from('credit_transactions').insert({
    subscription_id: data.id,
    player_id: playerId,
    delta: visits,
    reason: 'grant',
    created_by: playerId,
  });
  if (txnError) throw new Error(txnError.message);

  return data.id;
}

/**
 * Removes every subscription a player holds, ledger and all.
 *
 * A suite that grants several to the same player in successive tests would
 * otherwise be testing against everything it had granted so far, and
 * pick_subscription's whole job is to choose between them — so which ones
 * exist has to be the test's decision rather than the previous test's.
 */
export async function clearSubscriptions(playerId: string): Promise<void> {
  const admin = serviceClient();
  const { data } = await admin.from('player_subscriptions').select('id').eq('player_id', playerId);

  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return;

  await admin.from('credit_transactions').delete().in('subscription_id', ids);
  await admin.from('player_subscriptions').delete().in('id', ids);
}

/**
 * Registers a subscription created by something other than the helper above —
 * `grant_subscription`, say — so `cleanupFixtures` takes it away afterwards.
 */
export function trackSubscription(subscriptionId: string): string {
  createdSubscriptions.push(subscriptionId);
  return subscriptionId;
}

/**
 * The balance of a subscription, computed the only way there is: the sum of
 * its ledger. BUILD-SPEC 6.2 and D56 — no counter column exists to read.
 */
export async function remainingCredits(subscriptionId: string): Promise<number> {
  const { data, error } = await serviceClient()
    .from('credit_transactions')
    .select('delta')
    .eq('subscription_id', subscriptionId);

  if (error) throw new Error(error.message);
  return data.reduce((total, row) => total + row.delta, 0);
}

export async function bookingRow(bookingId: string): Promise<{
  status: string;
  payment_method: string;
  payment_status: string;
  expected_fils: number;
  paid_fils: number;
  source: string;
  attendee_kind: string;
  guest_name: string | null;
  is_coach_slot: boolean;
  credit_txn_id: string | null;
}> {
  const { data, error } = await serviceClient()
    .from('bookings')
    .select(
      'status, payment_method, payment_status, expected_fils, paid_fils, source, attendee_kind, guest_name, is_coach_slot, credit_txn_id',
    )
    .eq('id', bookingId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Every balance entry linked to one booking. BUILD-SPEC 8.5's rewrite rule. */
export async function balanceEntriesFor(
  bookingId: string,
): Promise<{ id: string; amount_fils: number; note: string | null }[]> {
  const { data, error } = await serviceClient()
    .from('balance_entries')
    .select('id, amount_fils, note')
    .eq('booking_id', bookingId);

  if (error) throw new Error(error.message);
  return data;
}

export async function sessionRow(sessionId: string): Promise<{
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  locked_at: string | null;
}> {
  const { data, error } = await serviceClient()
    .from('session_instances')
    .select('status, reviewed_at, reviewed_by, locked_at')
    .eq('id', sessionId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Everything this module made, removed in dependency order. */
export async function cleanupFixtures(): Promise<void> {
  const admin = serviceClient();

  if (createdSubscriptions.length > 0) {
    await admin.from('credit_transactions').delete().in('subscription_id', createdSubscriptions);
  }
  if (createdSessions.length > 0) {
    // Bookings, waitlist entries and rotations all cascade from the session.
    await admin.from('session_instances').delete().in('id', createdSessions);
  }
  if (createdBookings.length > 0) {
    await admin.from('bookings').delete().in('id', createdBookings);
  }
  if (createdSubscriptions.length > 0) {
    await admin.from('player_subscriptions').delete().in('id', createdSubscriptions);
  }

  createdSessions.length = 0;
  createdBookings.length = 0;
  createdSubscriptions.length = 0;
}
