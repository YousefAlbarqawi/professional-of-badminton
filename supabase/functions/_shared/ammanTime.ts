/**
 * The one time format a notification needs, in Amman, without a date library.
 *
 * BUILD-SPEC 5.1: "Jordan is permanently UTC+3 with no daylight saving since
 * 2022. Do not implement DST logic." That is why this file can exist at all —
 * the conversion is an addition, so the edge function does not need date-fns-tz
 * and the phone's formatting can be reproduced exactly rather than
 * approximately.
 *
 * 16.1 fixes the shape: 12 hour with AM/PM in English, صباحاً / مساءً in
 * Arabic, Western digits in both. `src/lib/time.ts` `formatSessionTime` is the
 * app's implementation of the same rule, and
 * `src/features/notifications/__tests__/pushStrings.test.ts` asserts the two
 * agree across a day's worth of instants. If one is changed the test fails,
 * which is the only reason it is safe for this to be a second copy.
 *
 * Deliberately free of Deno APIs and of every import: this file is loaded by
 * the edge function under Deno and by Jest under Node, and it has to mean the
 * same thing in both.
 */

/** Jordan is UTC+3, permanently. BUILD-SPEC 5.1. */
export const AMMAN_UTC_OFFSET_MINUTES = 180;

export type PushLocale = 'ar' | 'en';

/**
 * "7:00 PM" / "7:00 مساءً". Takes anything `Date` accepts, because the payload
 * carries an ISO string written by Postgres.
 *
 * Midnight is 12:00 AM and noon is 12:00 PM, matching `date-fns`'s `h`.
 */
export function formatAmmanTime(instant: Date | string | number, locale: PushLocale): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return '';

  const shifted = new Date(date.getTime() + AMMAN_UTC_OFFSET_MINUTES * 60_000);
  const hour24 = shifted.getUTCHours();
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  const suffix = locale === 'en' ? (hour24 < 12 ? 'AM' : 'PM') : hour24 < 12 ? 'صباحاً' : 'مساءً';

  return `${hour12}:${minutes} ${suffix}`;
}
