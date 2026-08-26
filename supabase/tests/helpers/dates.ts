/**
 * Amman calendar arithmetic for the integration suite.
 *
 * `new Date()` is banned outside src/lib/time.ts (BUILD-SPEC 5.1), and these
 * tests need to say "three days from today" and "the next Sunday" without
 * reaching for it. Everything here is built on the sanctioned helpers.
 *
 * A day key is a `yyyy-MM-dd` Amman calendar day, the same value the
 * `session_date` column carries and the same one `amman_today()` returns.
 */
import { addDays } from 'date-fns';

import { ammanDayKey, parseInstant } from '../../../src/lib/time';

/**
 * Midday UTC on a day key: 15:00 Amman, comfortably inside the same calendar
 * day whichever side of the offset you read it from.
 */
function middayOf(dayKey: string): Date {
  return parseInstant(`${dayKey}T12:00:00Z`);
}

/** The Amman day `days` after `dayKey`. Negative goes backwards. */
export function offsetDayKey(dayKey: string, days: number): string {
  return ammanDayKey(addDays(middayOf(dayKey), days));
}

/**
 * The first day key on or after `from` whose weekday is `weekday`, using the
 * same 0 = Sunday numbering as Postgres `EXTRACT(DOW)` and the `weekday`
 * columns in section 6.2.
 */
export function nextWeekdayKey(from: string, weekday: number): string {
  let candidate = from;
  for (let step = 0; step < 7; step += 1) {
    if (middayOf(candidate).getUTCDay() === weekday) return candidate;
    candidate = offsetDayKey(candidate, 1);
  }
  throw new Error(`nextWeekdayKey() expects 0-6, received ${String(weekday)}`);
}
