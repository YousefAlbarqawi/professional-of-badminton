/**
 * Session reads and the three staff writes.
 *
 * Every screen goes through a TanStack Query hook in queries.ts, never
 * through this file directly. CLAUDE.md.
 *
 * Occupancy is a second round trip rather than an embedded join, because
 * `v_session_occupancy` has no foreign key relationship for PostgREST to
 * follow. It is one extra request for at most ninety rows on a system with
 * three hundred players; a view with a relationship, or an RPC, would buy
 * nothing here and cost a migration.
 */
import { supabase } from '@/lib/supabase';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';
import { isTier, type Tier } from '@/lib/tiers';

import type {
  Attendee,
  CancelSessionInput,
  CreateSessionInput,
  MyBookingProfile,
  Occupancy,
  Session,
  UpdateSessionInput,
  VenueOption,
} from './types';

const SESSION_COLUMNS = `
  id, venue_id, session_date, starts_at, ends_at, session_type, price_fils,
  court_count, rotation_count, status, notes, cancellation_note,
  venues!inner ( id, name_en, name_ar, area_en, area_ar, google_maps_url )
` as const;

interface VenueRow {
  id: string;
  name_en: string;
  name_ar: string;
  area_en: string;
  area_ar: string;
  google_maps_url: string | null;
}

interface SessionRow {
  id: string;
  venue_id: string;
  session_date: string;
  starts_at: string;
  ends_at: string;
  session_type: Session['sessionType'];
  price_fils: number;
  court_count: number;
  rotation_count: number;
  status: Session['status'];
  notes: string | null;
  cancellation_note: string | null;
  venues: VenueRow;
}

const EMPTY_OCCUPANCY: Occupancy = { capacity: 0, taken: 0, remaining: 0 };

function toSession(row: SessionRow, locale: Locale, occupancy: Occupancy): Session {
  return {
    id: row.id,
    venue: {
      id: row.venues.id,
      name: locale === 'ar' ? row.venues.name_ar : row.venues.name_en,
      area: locale === 'ar' ? row.venues.area_ar : row.venues.area_en,
      googleMapsUrl: row.venues.google_maps_url,
    },
    sessionDate: row.session_date,
    startsAt: parseInstant(row.starts_at),
    endsAt: parseInstant(row.ends_at),
    sessionType: row.session_type,
    priceFils: row.price_fils as Fils,
    courtCount: row.court_count,
    rotationCount: row.rotation_count,
    status: row.status,
    occupancy,
    notes: row.notes,
    cancellationNote: row.cancellation_note,
  };
}

/**
 * Occupancy for a set of sessions. Returns a map so the caller can look up
 * without a second pass, and a session missing from the view — which cannot
 * happen, since it is grouped over `session_instances` — reads as empty rather
 * than crashing the list.
 */
export async function fetchOccupancy(
  sessionIds: readonly string[],
): Promise<Map<string, Occupancy>> {
  const occupancy = new Map<string, Occupancy>();
  if (sessionIds.length === 0) return occupancy;

  const { data, error } = await supabase
    .from('v_session_occupancy')
    .select('session_id, capacity, taken, remaining')
    .in('session_id', [...sessionIds]);

  if (error) throw error;

  for (const row of data) {
    if (row.session_id === null) continue;
    occupancy.set(row.session_id, {
      capacity: row.capacity ?? 0,
      taken: Number(row.taken ?? 0),
      remaining: Number(row.remaining ?? 0),
    });
  }

  return occupancy;
}

export interface DateRange {
  /** `yyyy-MM-dd` in Amman, inclusive. */
  from: string;
  /** `yyyy-MM-dd` in Amman, inclusive. */
  to: string;
}

/**
 * Sessions in a date range, with their venue and occupancy.
 *
 * What comes back depends on who is asking, and that is RLS's decision, not
 * this function's: a player sees his 5 day window and any session he has a
 * booking on (A20), staff see everything.
 */
export async function fetchSessionsInRange(range: DateRange, locale: Locale): Promise<Session[]> {
  const { data, error } = await supabase
    .from('session_instances')
    .select(SESSION_COLUMNS)
    .gte('session_date', range.from)
    .lte('session_date', range.to)
    .order('starts_at', { ascending: true });

  if (error) throw error;

  const rows = data as unknown as SessionRow[];
  const occupancy = await fetchOccupancy(rows.map((row) => row.id));

  return rows.map((row) => toSession(row, locale, occupancy.get(row.id) ?? EMPTY_OCCUPANCY));
}

export async function fetchSession(sessionId: string, locale: Locale): Promise<Session> {
  const { data, error } = await supabase
    .from('session_instances')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .single();

  if (error) throw error;

  const row = data as unknown as SessionRow;
  const occupancy = await fetchOccupancy([row.id]);

  return toSession(row, locale, occupancy.get(row.id) ?? EMPTY_OCCUPANCY);
}

/**
 * The attendee list, exactly as the caller's visibility level permits.
 *
 * 7.2: players never select from `bookings`. This is a security definer
 * function and it is the boundary — a level 0 player gets his own row with the
 * name and tier nulled, whatever the client then does with it.
 */
export async function fetchSessionAttendees(sessionId: string): Promise<Attendee[]> {
  const { data, error } = await supabase.rpc('get_session_attendees', {
    p_session_id: sessionId,
  });

  if (error) throw error;

  return data.map((row) => ({
    bookingId: row.booking_id,
    displayName: row.display_name,
    tier: toTier(row.tier),
    isSelf: row.is_self,
  }));
}

function toTier(value: string | null): Tier | null {
  return value !== null && isTier(value) ? value : null;
}

/**
 * Visibility level and custom rates, read from the caller's own profile row.
 *
 * Deliberately not part of `MyProfile`: 14.12 says the profile screen shows
 * neither, so the profile query does not fetch either. Session detail has to
 * know the level to choose between the three attendee variants in 14.7, and
 * the schedule has to know the rates to show the right price (14.6, D41).
 * Neither number is ever rendered.
 */
export async function fetchMyBookingProfile(userId: string): Promise<MyBookingProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('visibility, custom_rate_standard_fils, custom_rate_extended_fils')
    .eq('id', userId)
    .single();

  if (error) throw error;

  return {
    visibility: data.visibility,
    customRateStandardFils:
      data.custom_rate_standard_fils === null ? null : (data.custom_rate_standard_fils as Fils),
    customRateExtendedFils:
      data.custom_rate_extended_fils === null ? null : (data.custom_rate_extended_fils as Fils),
  };
}

/** The two venues, for the one-off session form. 15.6. */
export async function fetchVenues(locale: Locale): Promise<VenueOption[]> {
  const { data, error } = await supabase
    .from('venues')
    .select('id, name_en, name_ar, area_en, area_ar, court_count')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    name: locale === 'ar' ? row.name_ar : row.name_en,
    area: locale === 'ar' ? row.area_ar : row.area_en,
    courtCount: row.court_count,
  }));
}

// ── Staff writes ─────────────────────────────────────────
// All three are security definer RPCs. The capacity guard, the 5.5 status
// rules and the 9.4 cancellation sequence live in Postgres, not here.

export async function updateSession(input: UpdateSessionInput): Promise<void> {
  const { error } = await supabase.rpc('update_session_instance', {
    p_session_id: input.sessionId,
    p_start_time: input.startTime,
    p_duration_minutes: input.durationMinutes,
    p_price_fils: input.priceFils,
    p_court_count: input.courtCount,
    // exactOptionalPropertyTypes: an absent note is an absent key, not an
    // explicit undefined, and the RPC's own DEFAULT NULL then applies.
    ...(input.notes === null ? {} : { p_notes: input.notes }),
  });

  if (error) throw error;
}

export async function createOneOffSession(input: CreateSessionInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_one_off_session', {
    p_venue_id: input.venueId,
    p_session_date: input.sessionDate,
    p_start_time: input.startTime,
    p_duration_minutes: input.durationMinutes,
    p_price_fils: input.priceFils,
    p_court_count: input.courtCount,
    p_rotation_count: input.rotationCount,
  });

  if (error) throw error;

  return data;
}

/**
 * D62/A15: "a seventh rotation, if played, uses rule 1", added by hand from
 * the court board. Raises rotation_count by one and returns the new value —
 * the caller regenerates the lineup from it, this function does not touch the
 * lineup itself.
 */
export async function addRotation(sessionId: string): Promise<number> {
  const { data, error } = await supabase.rpc('add_rotation', { p_session_id: sessionId });
  if (error) throw error;
  return data;
}

/**
 * 9.4. Cancels the session, cancels its bookings, returns every credit, and
 * redivides the night's court cost across whatever is left.
 *
 * It sends no push notification. D31.
 */
export async function cancelSession(input: CancelSessionInput): Promise<void> {
  const { error } = await supabase.rpc('cancel_session', {
    p_session_id: input.sessionId,
    ...(input.note === null ? {} : { p_note: input.note }),
  });

  if (error) throw error;
}
