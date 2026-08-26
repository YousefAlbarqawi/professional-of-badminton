/**
 * "3 hours ago" for the announcement list. BUILD-SPEC 14.11.
 *
 * Returns a key and a count rather than a sentence, for two reasons 16.1
 * gives. Fragments are never concatenated — "3" plus "hours ago" is not how
 * Arabic builds that phrase. And anything counted goes through i18next
 * plurals, because Arabic has six forms and an `if` faking them is exactly
 * what that rule forbids.
 *
 * Past a month the relative form stops being informative and becomes evasive,
 * so it hands back to `formatSessionDate`, which is the app's one date
 * renderer and already knows the Levantine month names.
 */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Beyond this an exact date reads better than a count of days. */
const ABSOLUTE_AFTER_DAYS = 30;

export type RelativeTime = { kind: 'relative'; key: string; count: number } | { kind: 'absolute' };

export function relativeTime(publishedAt: Date, now: Date): RelativeTime {
  // A clock a few seconds behind the server must not produce "in 2 minutes".
  const elapsed = Math.max(0, now.getTime() - publishedAt.getTime());

  if (elapsed < MINUTE) {
    return { kind: 'relative', key: 'announcements.justNow', count: 0 };
  }
  if (elapsed < HOUR) {
    return {
      kind: 'relative',
      key: 'announcements.minutesAgo',
      count: Math.floor(elapsed / MINUTE),
    };
  }
  if (elapsed < DAY) {
    return { kind: 'relative', key: 'announcements.hoursAgo', count: Math.floor(elapsed / HOUR) };
  }

  const days = Math.floor(elapsed / DAY);
  if (days <= ABSOLUTE_AFTER_DAYS) {
    return { kind: 'relative', key: 'announcements.daysAgo', count: days };
  }

  return { kind: 'absolute' };
}
