/**
 * Session domain types.
 *
 * `startsAt` and `endsAt` are instants, parsed from `timestamptz` — never
 * wall-clock Dates. `sessionDate` is the Amman calendar day the row carries,
 * as `yyyy-MM-dd`, and is what the schedule groups by. See src/lib/time.ts for
 * why the distinction matters.
 */
import type { Fils } from '@/lib/money';
import type { Tier } from '@/lib/tiers';
import type { Database } from '@/types/database';

export type SessionStatus = Database['public']['Enums']['session_status'];
export type SessionType = Database['public']['Enums']['session_type'];
export type VisibilityLevel = Database['public']['Enums']['visibility_level'];

/** 3.1: two venues only. Names arrive in both languages and are picked here. */
export interface VenueSummary {
  id: string;
  name: string;
  area: string;
  googleMapsUrl: string | null;
}

/** From `v_session_occupancy`. Integers, and not private at any level. 14.6. */
export interface Occupancy {
  capacity: number;
  taken: number;
  remaining: number;
}

/** One dated session, as every screen in this phase reads it. */
export interface Session {
  id: string;
  venue: VenueSummary;
  /** The Amman calendar day, `yyyy-MM-dd`. Matches `session_date`. */
  sessionDate: string;
  startsAt: Date;
  endsAt: Date;
  sessionType: SessionType;
  /** The session's list price. What a player pays may differ — see D41. */
  priceFils: Fils;
  courtCount: number;
  rotationCount: number;
  status: SessionStatus;
  occupancy: Occupancy;
  notes: string | null;
  cancellationNote: string | null;
}

/** A session as the player's schedule and detail screens see it. */
export interface PlayerSession extends Session {
  /** D41: the player's own rate when he has one, otherwise `priceFils`. */
  payableFils: Fils;
  /** True when the payable amount is an override rather than the list price. */
  hasCustomRate: boolean;
  /** 14.6: the booked chip. */
  isBooked: boolean;
  isOnWaitlist: boolean;
}

/**
 * The parts of a profile the schedule needs and 14.12 deliberately keeps off
 * the profile screen. Fetched separately from `MyProfile` so that no future
 * edit to the profile screen can put a visibility level on it by accident.
 */
export interface MyBookingProfile {
  visibility: VisibilityLevel;
  customRateStandardFils: Fils | null;
  customRateExtendedFils: Fils | null;
}

/**
 * One row of `get_session_attendees`. What is populated depends entirely on
 * the caller's visibility level, and the decision is the server's: at level 0
 * only the caller's own row comes back, at level 1 the names are null, at
 * level 2 everything is present. 7.2.
 */
export interface Attendee {
  bookingId: string;
  displayName: string | null;
  tier: Tier | null;
  isSelf: boolean;
}

/** A day's worth of sessions, for the sticky-header lists in 14.6 and 15.3. */
export interface SessionDay<T> {
  /** `yyyy-MM-dd` in Amman. */
  dayKey: string;
  /** Any instant inside that Amman day, for formatting the header. */
  date: Date;
  sessions: T[];
}

export interface VenueOption {
  id: string;
  name: string;
  area: string;
  courtCount: number;
}

/** 15.4. `notes` is the only optional field. */
export interface UpdateSessionInput {
  sessionId: string;
  /** `HH:mm` in Amman. */
  startTime: string;
  durationMinutes: 90 | 150;
  priceFils: Fils;
  courtCount: number;
  notes: string | null;
}

/** 15.6. No recurrence option; one-off means one-off. */
export interface CreateSessionInput {
  venueId: string;
  /** `yyyy-MM-dd` in Amman. */
  sessionDate: string;
  startTime: string;
  durationMinutes: 90 | 150;
  priceFils: Fils;
  courtCount: number;
  rotationCount: number;
}

export interface CancelSessionInput {
  sessionId: string;
  note: string | null;
}

/** Everything the 9.4 announcement composer is prefilled with. */
export interface CancellationAnnouncementParams extends Record<string, string> {
  venue: string;
  date: string;
  time: string;
}
