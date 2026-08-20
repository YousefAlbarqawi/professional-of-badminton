/**
 * Time. Everything in this app is Asia/Amman. Jordan has been permanently
 * UTC+3 with no daylight saving since 2022, so there is no DST logic here.
 * BUILD-SPEC section 5.1.
 *
 * Two kinds of Date flow through this module, and confusing them is the one
 * real hazard:
 *
 *   - An **instant**. A true point in time, what `timestamptz` stores and what
 *     every cutoff comparison uses. `nowInAmman`, `ammanStartOfDay`,
 *     `bookingWindowEnd` and all three cutoffs return instants, and every
 *     function here takes instants as input.
 *   - A **wall-clock Date**, returned only by `toAmman`. Its `getHours()` and
 *     friends read as Amman local time, which is what you want for display
 *     and for bucketing by day. Never compare one of these against an instant.
 *
 * The server is the authority on time. Anything computed here is for display
 * and for avoiding pointless round trips; every deadline is validated again in
 * Postgres so that a phone with a wrong clock cannot book after the cutoff.
 */
import { addDays, endOfDay, parseISO, startOfDay, subHours } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

import type { Locale } from './money';

export const TZ = 'Asia/Amman';

/** The booking window is 5 days including today, so today + 4. BUILD-SPEC 5.2. */
export const BOOKING_WINDOW_DAYS = 5;

/** Reservations close this long before start. D21. */
const RESERVATION_CUTOFF_HOURS = 1;

/** A player may cancel his own booking until this long before start. D23. */
const CANCELLATION_CUTOFF_HOURS = 3;

/** The review window, after which a session locks permanently. D39. */
const REVIEW_WINDOW_DAYS = 7;

/**
 * Levantine month names, as used in Jordan. Not transliterated Gregorian ones.
 * BUILD-SPEC 16.1.
 */
const ARABIC_MONTHS = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
] as const;

const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function asDate(d: Date | string): Date {
  return typeof d === 'string' ? parseISO(d) : d;
}

/**
 * The current instant. This is the sanctioned way to read the clock: `new
 * Date()` is banned by lint everywhere except this file, so that every
 * time-dependent decision routes through helpers that know about Amman.
 */
export function nowInAmman(): Date {
  return new Date();
}

/**
 * Parse an ISO 8601 string into an instant. This is how a `timestamptz` from
 * Postgres becomes a Date, and the only sanctioned way to build one from a
 * string, since `new Date()` is banned outside this module.
 */
export function parseInstant(iso: string): Date {
  const parsed = parseISO(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`parseInstant() received an unparseable value: ${iso}`);
  }
  return parsed;
}

/**
 * The Amman wall-clock representation of an instant. Read its fields for
 * display or day bucketing; never compare it against an instant.
 */
export function toAmman(d: Date | string): Date {
  return toZonedTime(asDate(d), TZ);
}

/** The instant at which the Amman day containing `d` begins (00:00:00.000). */
export function ammanStartOfDay(d: Date): Date {
  return fromZonedTime(startOfDay(toAmman(d)), TZ);
}

/** The instant at which the Amman day containing `d` ends (23:59:59.999). */
export function ammanEndOfDay(d: Date): Date {
  return fromZonedTime(endOfDay(toAmman(d)), TZ);
}

/**
 * The last instant a session may start at and still be inside the booking
 * window: the end of the fifth day counting today as the first.
 *
 * Worked example from BUILD-SPEC 5.2 — now is Tuesday 20 August 14:00 Amman,
 * so Tuesday 20 through Saturday 24 are visible and Sunday 25 is not. The
 * `create_booking` guard in 8.2 uses the same boundary
 * (`session_date > current_date + interval '4 days'` is rejected).
 */
export function bookingWindowEnd(now: Date): Date {
  return ammanEndOfDay(addDays(ammanStartOfDay(now), BOOKING_WINDOW_DAYS - 1));
}

/** Reservations close one hour before the session starts. D21. */
export function reservationCutoff(startsAt: Date): Date {
  return subHours(startsAt, RESERVATION_CUTOFF_HOURS);
}

/** A player may cancel until three hours before the session starts. D23. */
export function cancellationCutoff(startsAt: Date): Date {
  return subHours(startsAt, CANCELLATION_CUTOFF_HOURS);
}

/** A session locks permanently seven days after it ends. D39. */
export function reviewDeadline(endsAt: Date): Date {
  return addDays(endsAt, REVIEW_WINDOW_DAYS);
}

/** True when `now` is before the reservation cutoff for this session. */
export function isWithinReservationWindow(startsAt: Date, now: Date): boolean {
  return now.getTime() < reservationCutoff(startsAt).getTime();
}

/** True when `now` is before the cancellation cutoff for this session. */
export function isWithinCancellationWindow(startsAt: Date, now: Date): boolean {
  return now.getTime() < cancellationCutoff(startsAt).getTime();
}

/**
 * The Amman calendar day of an instant as `yyyy-MM-dd`. This is the value that
 * matches the `session_date` column and the key the schedule groups by.
 */
export function ammanDayKey(d: Date): string {
  return formatInTimeZone(d, TZ, 'yyyy-MM-dd');
}

/**
 * Time of day, 12 hour, in Amman. "7:00 PM" in English, "7:00 مساءً" in
 * Arabic. Digits are Western in both languages. BUILD-SPEC 16.1.
 */
export function formatSessionTime(d: Date, locale: Locale): string {
  const hourMinute = formatInTimeZone(d, TZ, 'h:mm');

  if (locale === 'en') {
    return `${hourMinute} ${formatInTimeZone(d, TZ, 'a')}`;
  }

  const hour24 = Number(formatInTimeZone(d, TZ, 'H'));
  return `${hourMinute} ${hour24 < 12 ? 'صباحاً' : 'مساءً'}`;
}

/**
 * A session date in Amman. "20 August 2026" in English, "20 آب 2026" in
 * Arabic, using Levantine month names and Western digits. BUILD-SPEC 16.1.
 */
export function formatSessionDate(d: Date, locale: Locale): string {
  const day = formatInTimeZone(d, TZ, 'd');
  const monthIndex = Number(formatInTimeZone(d, TZ, 'M')) - 1;
  const year = formatInTimeZone(d, TZ, 'yyyy');
  const month = locale === 'en' ? ENGLISH_MONTHS[monthIndex] : ARABIC_MONTHS[monthIndex];

  return `${day} ${month ?? ''} ${year}`;
}

/**
 * The full time range of a session, for the detail screen: "7:00 – 8:30 PM".
 * The dash is a bidi-neutral en dash, so it renders correctly in both
 * directions.
 */
export function formatSessionTimeRange(startsAt: Date, endsAt: Date, locale: Locale): string {
  return `${formatSessionTime(startsAt, locale)} – ${formatSessionTime(endsAt, locale)}`;
}
