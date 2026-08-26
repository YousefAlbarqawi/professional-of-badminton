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
 * The inverse: the instant at which an Amman calendar day begins.
 *
 * A `date` column — `session_date`, `starts_on`, `expires_on` — arrives as a
 * bare `yyyy-MM-dd` with no time and no zone. Handing that to `parseInstant`
 * would produce midnight in whatever zone the phone happens to be in, and a
 * phone east of Amman would then render the day before. This anchors it in
 * Amman, which is the only zone this app has (5.1).
 */
export function ammanDayStart(dayKey: string): Date {
  return fromZonedTime(`${dayKey}T00:00:00`, TZ);
}

/**
 * A `yyyy-MM-dd`, as the local-midnight wall-clock `Date` A35's date picker
 * (`DateField`) wants to open on.
 *
 * Deliberately not `ammanDayStart`: that anchors the day in Amman and returns
 * an instant, which is right for a `date` column but wrong for a native
 * picker's calendar wheel — the wheel reads a `Date`'s *local* fields, and a
 * phone in a different zone would show the wrong day if handed an Amman
 * instant. This builds the local fields directly instead, matching the wheel
 * the same way a typed `yyyy-MM-dd` was never zone-converted either.
 */
export function dayKeyToCalendarDate(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
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

/**
 * The Amman calendar month of an instant as `yyyy-MM`. This is what the report
 * month picker holds and what keys its queries. BUILD-SPEC 15.12.
 */
export function ammanMonthKey(d: Date): string {
  return formatInTimeZone(d, TZ, 'yyyy-MM');
}

/** The month the coach is standing in, in Amman. */
export function currentAmmanMonthKey(): string {
  return ammanMonthKey(nowInAmman());
}

/**
 * A month key as the `date` a report RPC takes. The functions in migration
 * 0036 all `date_trunc('month', p_month)` their argument, so the first of the
 * month is both the honest value and the one they expect.
 */
export function monthKeyToDate(monthKey: string): string {
  return `${monthKey}-01`;
}

/**
 * Move a month key by whole months. `shiftMonthKey('2026-01', -1)` is
 * `'2025-12'`.
 *
 * The arithmetic is on the key's own integers rather than on a Date, because a
 * Date would drag a timezone into a question that has none: a month is a label
 * on a calendar, and 31 January plus one month is a trap that this avoids
 * entirely.
 */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`shiftMonthKey() requires a yyyy-MM key, received ${monthKey}`);
  }

  const zeroBased = year * 12 + (month - 1) + delta;
  const shiftedYear = Math.floor(zeroBased / 12);
  const shiftedMonth = zeroBased - shiftedYear * 12 + 1;

  return `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}`;
}

/**
 * A month for the picker: "August 2026", "آب 2026". Levantine month names and
 * Western digits in both languages, exactly as `formatSessionDate`. 16.1.
 */
export function formatMonthLabel(monthKey: string, locale: Locale): string {
  const [year, monthPart] = monthKey.split('-');
  const monthIndex = Number(monthPart) - 1;
  const month = locale === 'en' ? ENGLISH_MONTHS[monthIndex] : ARABIC_MONTHS[monthIndex];

  return `${month ?? ''} ${year ?? ''}`.trim();
}

/**
 * The Sunday-anchored week a `date` column falls in, formatted for a bar
 * label. Weeks start on Sunday throughout this app, matching the weekday
 * integers of 6.2 (0 = Sunday) and `report_revenue_by_week` in migration 0036.
 */
export function formatWeekLabel(dayKey: string, locale: Locale): string {
  const start = ammanDayStart(dayKey);
  const day = formatInTimeZone(start, TZ, 'd');
  const monthIndex = Number(formatInTimeZone(start, TZ, 'M')) - 1;
  const month = locale === 'en' ? ENGLISH_MONTHS[monthIndex] : ARABIC_MONTHS[monthIndex];

  return `${day} ${month ?? ''}`;
}

/**
 * A bare `time` column — `session_templates.start_time`, which arrives as
 * `HH:mm:ss` — rendered like every other time in the app: 12 hour, Western
 * digits, "7:30 PM" or "7:30 مساءً". 16.1.
 *
 * It has no date and therefore no instant, which is why it cannot go through
 * `formatSessionTime`. A recurring slot is a time of day and nothing more.
 */
export function formatClockTime(clock: string, locale: Locale): string {
  const [hourPart, minutePart] = clock.split(':');
  const hour24 = Number(hourPart);
  const minute = minutePart ?? '00';

  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) {
    throw new Error(`formatClockTime() requires HH:mm, received ${clock}`);
  }

  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const hourMinute = `${hour12}:${minute.padStart(2, '0')}`;

  if (locale === 'en') return `${hourMinute} ${hour24 < 12 ? 'AM' : 'PM'}`;
  return `${hourMinute} ${hour24 < 12 ? 'صباحاً' : 'مساءً'}`;
}
