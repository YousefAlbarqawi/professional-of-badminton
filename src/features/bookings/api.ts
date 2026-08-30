/**
 * Booking reads and writes.
 *
 * Every screen goes through a TanStack Query hook in queries.ts or
 * mutations.ts, never through this file directly. CLAUDE.md.
 *
 * RLS gives a player his own rows and nobody else's, which is all the read
 * side asks for. Other people's bookings reach him, if his level permits, only
 * through `get_session_attendees`. Staff read the table itself (7.3), which is
 * what 15.2's roster is.
 *
 * Nothing here writes to `bookings` directly. Every write is a security
 * definer RPC, because every one of them enforces something a client must not
 * be trusted with: capacity under a lock (5.4), the two cutoffs (D21, D23),
 * and the credit ledger (D56).
 */
import { supabase } from '@/lib/supabase';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';
import { isTier, type Tier } from '@/lib/tiers';

import type {
  AddCoachInput,
  AddGuestInput,
  AddPlayerInput,
  BookingSession,
  CoachOption,
  CreateBookingInput,
  MoveBookingInput,
  MyBooking,
  PlayerSearchResult,
  RemoveBookingInput,
  RosterEntry,
} from './types';

/**
 * The session ids the player holds a confirmed booking on, within a date
 * range. A set rather than a list because every caller is asking "is this
 * one mine?" of a session it already has.
 */
export async function fetchMyBookedSessionIds(
  playerId: string,
  range: { from: string; to: string },
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('bookings')
    .select('session_id, session_instances!inner ( session_date )')
    .eq('player_id', playerId)
    .eq('status', 'confirmed')
    .gte('session_instances.session_date', range.from)
    .lte('session_instances.session_date', range.to);

  if (error) throw error;

  return new Set(data.map((row) => row.session_id));
}

/**
 * The player's confirmed booking on one session, or null.
 *
 * The id and not a boolean: 14.7's *Cancel my reservation* needs something to
 * cancel, and `cancel_own_booking` takes a booking id. The unique index on
 * (session_id, player_id) where status = 'confirmed' guarantees there is at
 * most one.
 */
export async function fetchMyBookingIdOnSession(
  playerId: string,
  sessionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('player_id', playerId)
    .eq('session_id', sessionId)
    .eq('status', 'confirmed')
    .maybeSingle();

  if (error) throw error;

  return data?.id ?? null;
}

/**
 * Whether the player is sitting on this session's waiting list.
 *
 * Joining and leaving are phase 4. The read is here because 14.7's action
 * table needs it now: *Leave the waiting list* is one of the eight states, and
 * a state the screen cannot detect is a state it cannot render.
 */
export async function fetchIsOnWaitlist(playerId: string, sessionId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('waitlist_entries')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .eq('session_id', sessionId)
    .is('left_at', null);

  if (error) throw error;

  return (count ?? 0) > 0;
}

// ── My bookings ──────────────────────────────────────────

/**
 * Every column the player's own booking screens are allowed to know about.
 *
 * `payment_status` and `paid_fils` are deliberately absent. 14.10: the player
 * is never shown whether the coach marked him paid. A4 keeps balances
 * coach-only for the same reason, and the safest place to enforce that is the
 * select list.
 */
const MY_BOOKING_COLUMNS = `
  id, status, payment_method, expected_fils, booked_at,
  session_instances!inner (
    id, session_date, starts_at, ends_at, session_type, status, cancellation_note,
    venues!inner ( id, name_en, name_ar, area_en, area_ar, google_maps_url )
  )
` as const;

interface BookingVenueRow {
  id: string;
  name_en: string;
  name_ar: string;
  area_en: string;
  area_ar: string;
  google_maps_url: string | null;
}

interface MyBookingRow {
  id: string;
  status: MyBooking['status'];
  payment_method: MyBooking['paymentMethod'];
  expected_fils: number;
  booked_at: string;
  session_instances: {
    id: string;
    session_date: string;
    starts_at: string;
    ends_at: string;
    session_type: BookingSession['sessionType'];
    status: BookingSession['status'];
    cancellation_note: string | null;
    venues: BookingVenueRow;
  };
}

function toMyBooking(row: MyBookingRow, locale: Locale): MyBooking {
  const session = row.session_instances;

  return {
    id: row.id,
    status: row.status,
    paymentMethod: row.payment_method,
    expectedFils: row.expected_fils as Fils,
    bookedAt: parseInstant(row.booked_at),
    session: {
      id: session.id,
      venue: {
        id: session.venues.id,
        name: locale === 'ar' ? session.venues.name_ar : session.venues.name_en,
        area: locale === 'ar' ? session.venues.area_ar : session.venues.area_en,
        googleMapsUrl: session.venues.google_maps_url,
      },
      sessionDate: session.session_date,
      startsAt: parseInstant(session.starts_at),
      endsAt: parseInstant(session.ends_at),
      sessionType: session.session_type,
      status: session.status,
      cancellationNote: session.cancellation_note,
    },
  };
}

/**
 * All of the player's bookings that either screen could want. 14.9 shows the
 * past for 30 days and 5.2 hides it after that; both cuts are made on the
 * client by `splitBookings`, because a booking that falls off the list is a
 * presentation decision and the row itself is still his.
 *
 * A20 is what makes the join work at all: a player can read a session he has a
 * booking on whatever its date, which is otherwise outside his 5 day window.
 */
export async function fetchMyBookings(playerId: string, locale: Locale): Promise<MyBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(MY_BOOKING_COLUMNS)
    .eq('player_id', playerId)
    .order('booked_at', { ascending: false });

  if (error) throw error;

  return (data as unknown as MyBookingRow[]).map((row) => toMyBooking(row, locale));
}

export async function fetchMyBooking(bookingId: string, locale: Locale): Promise<MyBooking> {
  const { data, error } = await supabase
    .from('bookings')
    .select(MY_BOOKING_COLUMNS)
    .eq('id', bookingId)
    .single();

  if (error) throw error;

  return toMyBooking(data as unknown as MyBookingRow, locale);
}

// ── Player writes ────────────────────────────────────────

/** 8.2. Returns the new booking's id. */
export async function createBooking(input: CreateBookingInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_booking', {
    p_session_id: input.sessionId,
    p_payment_method: input.method,
  });

  if (error) throw error;

  return data;
}

/** 8.3. The 3 hour window is checked again on the server. D23. */
export async function cancelOwnBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_own_booking', { p_booking_id: bookingId });
  if (error) throw error;
}

export async function joinWaitlist(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('join_waitlist', { p_session_id: sessionId });
  if (error) throw error;
}

export async function leaveWaitlist(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_waitlist', { p_session_id: sessionId });
  if (error) throw error;
}

// ── Staff reads ──────────────────────────────────────────

interface RosterRow {
  id: string;
  attendee_kind: RosterEntry['kind'];
  player_id: string | null;
  guest_name: string | null;
  guest_tier: string | null;
  tier_snapshot: string | null;
  payment_method: RosterEntry['paymentMethod'];
  expected_fils: number;
  is_coach_slot: boolean;
  booked_at: string;
  profiles: { first_name: string; last_name: string; tier: string | null } | null;
}

function toTier(value: string | null): Tier | null {
  return value !== null && isTier(value) ? value : null;
}

/**
 * 15.2's players tab: the attendee list with tier badges and payment method
 * chips.
 *
 * Staff select from `bookings` directly, which RLS permits them and nobody
 * else (7.3). The tier shown is `tier_snapshot` — what he was rated when he
 * booked, which is what the matchmaking engine will use (13.1) — falling back
 * to the guest's tier and then to the profile's for a booking made before a
 * rating existed.
 */
export async function fetchSessionRoster(sessionId: string): Promise<RosterEntry[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `id, attendee_kind, player_id, guest_name, guest_tier, tier_snapshot,
       payment_method, expected_fils, is_coach_slot, booked_at,
       profiles!bookings_player_id_fkey ( first_name, last_name, tier )`,
    )
    .eq('session_id', sessionId)
    .eq('status', 'confirmed')
    .order('booked_at', { ascending: true });

  if (error) throw error;

  return (data as unknown as RosterRow[]).map((row) => ({
    bookingId: row.id,
    kind: row.attendee_kind,
    displayName:
      row.profiles === null
        ? (row.guest_name ?? '')
        : `${row.profiles.first_name} ${row.profiles.last_name}`.trim(),
    tier: toTier(row.tier_snapshot) ?? toTier(row.guest_tier) ?? toTier(row.profiles?.tier ?? null),
    paymentMethod: row.payment_method,
    expectedFils: row.expected_fils as Fils,
    isCoachSlot: row.is_coach_slot,
    playerId: row.player_id,
  }));
}

/** 15.2's "Add player" search. Minimum two characters, enforced both ends. */
export async function searchPlayers(
  query: string,
  sessionId: string,
): Promise<PlayerSearchResult[]> {
  const { data, error } = await supabase.rpc('search_players_for_session', {
    p_query: query,
    p_session_id: sessionId,
  });

  if (error) throw error;

  return data.map((row) => ({
    playerId: row.player_id,
    displayName: row.display_name,
    tier: toTier(row.tier),
    credits: row.credits,
    creditExpires: row.credit_expires,
    isBooked: row.is_booked,
  }));
}

/** 15.2's "Add coach" picker, with D76's already-tonight warning. */
export async function fetchCoachOptions(sessionId: string): Promise<CoachOption[]> {
  const { data, error } = await supabase.rpc('list_coach_options', { p_session_id: sessionId });

  if (error) throw error;

  return data.map((row) => ({
    coachId: row.coach_id,
    displayName: row.display_name,
    tier: toTier(row.tier),
    isOnSession: row.is_on_session,
    isOnNight: row.is_on_night,
  }));
}

// ── Staff writes ─────────────────────────────────────────

export async function adminAddPlayer(input: AddPlayerInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_add_player', {
    p_session_id: input.sessionId,
    p_player_id: input.playerId,
    // exactOptionalPropertyTypes: leaving the choice to D43 means omitting the
    // key, so the function's own DEFAULT NULL applies.
    ...(input.useCredit === null ? {} : { p_use_credit: input.useCredit }),
  });

  if (error) throw error;

  return data;
}

export async function adminAddGuest(input: AddGuestInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_add_guest', {
    p_session_id: input.sessionId,
    p_guest_name: input.guestName,
    p_guest_tier: input.guestTier,
    p_is_free: input.isFree,
    ...(input.amountFils === null ? {} : { p_amount_fils: input.amountFils }),
  });

  if (error) throw error;

  return data;
}

export async function adminAddCoach(input: AddCoachInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_add_coach', {
    p_session_id: input.sessionId,
    p_coach_id: input.coachId,
    p_is_paid: input.isPaid,
  });

  if (error) throw error;

  return data;
}

export async function adminRemoveBooking(input: RemoveBookingInput): Promise<void> {
  const { error } = await supabase.rpc('admin_remove_booking', {
    p_booking_id: input.bookingId,
    ...(input.returnCredit === null ? {} : { p_return_credit: input.returnCredit }),
  });

  if (error) throw error;
}

/** 15.2's "Move to another session". Returns the new booking's id. */
export async function adminMoveBooking(input: MoveBookingInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_move_booking', {
    p_booking_id: input.bookingId,
    p_target_session_id: input.targetSessionId,
  });

  if (error) throw error;
  return data;
}
