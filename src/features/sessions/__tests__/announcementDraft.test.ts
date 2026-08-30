/**
 * The prefilled announcement after a cancellation. 9.4 step 6 and A6.
 */
import { parseInstant } from '@/lib/time';

import { cancellationAnnouncementParams } from '../announcementDraft';

const STARTS = parseInstant('2026-08-24T16:00:00Z');
const ENDS = parseInstant('2026-08-24T17:30:00Z');

describe('cancellationAnnouncementParams', () => {
  it('carries the venue, the date and the time', () => {
    const params = cancellationAnnouncementParams({
      venueName: 'International Independent Schools',
      startsAt: STARTS,
      endsAt: ENDS,
      locale: 'en',
    });

    expect(params).toEqual({
      venue: 'International Independent Schools',
      date: '24/8/2026',
      time: '7:00 PM – 8:30 PM',
    });
  });

  it('uses Western digits in Arabic', () => {
    // 16.1, and see CONFLICTS FOUND C1 for why the digits are Western. The
    // month name the original of this test checked for is gone: the date
    // format is numeric now, per client instruction — see src/lib/time.ts.
    const params = cancellationAnnouncementParams({
      venueName: 'مدارس الاستقلالية الدولية',
      startsAt: STARTS,
      endsAt: ENDS,
      locale: 'ar',
    });

    expect(params.date).toBe('24/8/2026');
    expect(params.time).toBe('7:00 مساءً – 8:30 مساءً');
    expect(params.date).not.toMatch(/[٠-٩]/);
  });

  it('formats in Amman, not in the device zone', () => {
    // 21:00 UTC is midnight in Amman, the next day.
    const params = cancellationAnnouncementParams({
      venueName: 'Khalda',
      startsAt: parseInstant('2026-08-24T21:00:00Z'),
      endsAt: parseInstant('2026-08-24T22:30:00Z'),
      locale: 'en',
    });

    expect(params.date).toBe('25/8/2026');
    expect(params.time).toBe('12:00 AM – 1:30 AM');
  });
});
