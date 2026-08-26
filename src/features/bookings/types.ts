/**
 * Booking domain types.
 *
 * What is absent matters as much as what is here. 14.10: "The player is never
 * shown `payment_status`, whether the coach marked him paid, or any balance."
 * So `MyBooking` has no payment status and no paid amount, and the query does
 * not ask for either — left out of the type rather than out of the JSX, so a
 * future screen cannot render one by accident. The same reasoning as
 * `MyProfile` in features/players/types.ts.
 */
import type { Fils } from '@/lib/money';
import type { Tier } from '@/lib/tiers';
import type { SessionStatus, SessionType, VenueSummary } from '@/features/sessions/types';
import type { Database } from '@/types/database';

export type BookingStatus = Database['public']['Enums']['booking_status'];
export type PaymentMethod = Database['public']['Enums']['payment_method'];
export type AttendeeKind = Database['public']['Enums']['attendee_kind'];

/** The three methods 14.8 offers a player. `free` is staff only. 10.1, A37. */
export type PlayerPaymentMethod = Extract<PaymentMethod, 'cash' | 'cliq' | 'credit'>;

export const PLAYER_PAYMENT_METHODS: readonly PlayerPaymentMethod[] = ['cash', 'cliq', 'credit'];

/** As much of a session as a booking row needs to describe itself. */
export interface BookingSession {
  id: string;
  venue: VenueSummary;
  /** The Amman calendar day, `yyyy-MM-dd`. */
  sessionDate: string;
  startsAt: Date;
  endsAt: Date;
  sessionType: SessionType;
  status: SessionStatus;
  cancellationNote: string | null;
}

/** One of the player's own bookings, as 14.9 and 14.10 render it. */
export interface MyBooking {
  id: string;
  status: BookingStatus;
  paymentMethod: PaymentMethod;
  /** A7: the price snapshot taken when he booked, not today's price. */
  expectedFils: Fils;
  bookedAt: Date;
  session: BookingSession;
}

/** 14.9's two segments, already split. */
export interface BookingSegments {
  upcoming: MyBooking[];
  past: MyBooking[];
}

/**
 * One row of 15.2's players tab. Staff read `bookings` directly — RLS gives
 * them everything (7.3) — so unlike `Attendee` from `get_session_attendees`
 * this carries the payment method the attendee list needs its chips for.
 */
export interface RosterEntry {
  bookingId: string;
  kind: AttendeeKind;
  /** A guest's typed name, or the player's. Never null for staff. */
  displayName: string;
  tier: Tier | null;
  paymentMethod: PaymentMethod;
  expectedFils: Fils;
  isCoachSlot: boolean;
  /** Null for a guest, who has no account. D44, D46. */
  playerId: string | null;
}

/** One result of 15.2's "Add player" search. */
export interface PlayerSearchResult {
  playerId: string;
  displayName: string;
  tier: Tier | null;
  /** Credits on the subscription that would be spent, nearest expiry first. */
  credits: number;
  /** `yyyy-MM-dd`, or null when he has no usable subscription. */
  creditExpires: string | null;
  /** 15.2: blocked if he is already booked, with the reason shown. */
  isBooked: boolean;
}

/** One entry of 15.2's "Add coach" picker. */
export interface CoachOption {
  coachId: string;
  displayName: string;
  tier: Tier | null;
  isOnSession: boolean;
  /** D76: already on another session tonight, so the 10 JD counts once. */
  isOnNight: boolean;
}

export interface CreateBookingInput {
  sessionId: string;
  method: PlayerPaymentMethod;
}

export interface AddPlayerInput {
  sessionId: string;
  playerId: string;
  /** Null leaves the choice to D43: credit if he has one, otherwise cash. */
  useCredit: boolean | null;
}

export interface AddGuestInput {
  sessionId: string;
  guestName: string;
  guestTier: Tier;
  isFree: boolean;
  /** Ignored when free. Defaults to the session price. D45. */
  amountFils: Fils | null;
}

export interface AddCoachInput {
  sessionId: string;
  coachId: string;
  /** D17: whether his 10 JD for the night has been paid. */
  isPaid: boolean;
}

export interface RemoveBookingInput {
  bookingId: string;
  sessionId: string;
  /** 8.3: null takes the default, which depends on the 3 hour window. */
  returnCredit: boolean | null;
}

/**
 * 15.2's "Move to another session". Nothing about payment is a parameter
 * here: migration 0037 carries the old booking's `expected_fils`, `paid_fils`
 * and payment method across unchanged, deliberately.
 */
export interface MoveBookingInput {
  bookingId: string;
  targetSessionId: string;
}
