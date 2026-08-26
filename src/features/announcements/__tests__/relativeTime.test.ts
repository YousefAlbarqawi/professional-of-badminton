/**
 * 14.11's relative timestamps.
 *
 * The function returns a key and a count rather than a sentence, so what is
 * asserted is which key and which count — the wording is the deck's, and
 * `keyParity.test.ts` guards that.
 */
import { relativeTime } from '../relativeTime';

const at = (iso: string): Date => new Date(iso);
const NOW = at('2026-08-21T12:00:00Z');

describe('relativeTime', () => {
  it('calls the last minute "just now"', () => {
    expect(relativeTime(at('2026-08-21T11:59:30Z'), NOW)).toEqual({
      kind: 'relative',
      key: 'announcements.justNow',
      count: 0,
    });
  });

  it('counts whole minutes under an hour', () => {
    expect(relativeTime(at('2026-08-21T11:17:00Z'), NOW)).toEqual({
      kind: 'relative',
      key: 'announcements.minutesAgo',
      count: 43,
    });
  });

  it('counts whole hours under a day', () => {
    expect(relativeTime(at('2026-08-21T09:30:00Z'), NOW)).toEqual({
      kind: 'relative',
      key: 'announcements.hoursAgo',
      count: 2,
    });
  });

  it('counts days up to a month', () => {
    expect(relativeTime(at('2026-08-18T12:00:00Z'), NOW)).toEqual({
      kind: 'relative',
      key: 'announcements.daysAgo',
      count: 3,
    });
    expect(relativeTime(at('2026-07-22T12:00:00Z'), NOW)).toEqual({
      kind: 'relative',
      key: 'announcements.daysAgo',
      count: 30,
    });
  });

  it('hands over to an exact date past a month', () => {
    expect(relativeTime(at('2026-07-21T12:00:00Z'), NOW)).toEqual({ kind: 'absolute' });
  });

  it('never says "in 2 minutes" when the phone clock is behind', () => {
    // 5.1 warns that a phone's clock cannot be trusted. A future timestamp is
    // a clock that is wrong, not an announcement that has not happened yet.
    expect(relativeTime(at('2026-08-21T12:02:00Z'), NOW)).toEqual({
      kind: 'relative',
      key: 'announcements.justNow',
      count: 0,
    });
  });
});
