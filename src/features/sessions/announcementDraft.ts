/**
 * The prefilled announcement after a session is cancelled.
 *
 * BUILD-SPEC 9.4 step 6 and assumption A6. Cancelling sends no push — that is
 * D31 and it is deliberate — so the coach is offered a composer instead,
 * "prefilled with the venue, date, and time". One tap, his decision, and the
 * announcement is what pushes.
 *
 * This produces the interpolation values rather than the sentence, because the
 * sentence lives in the string deck in both languages and must not be built by
 * concatenating translated fragments (16.1).
 */
import type { Locale } from '@/lib/money';
import { formatSessionDate, formatSessionTimeRange } from '@/lib/time';

import type { CancellationAnnouncementParams } from './types';

export interface AnnouncementDraftInput {
  venueName: string;
  startsAt: Date;
  endsAt: Date;
  locale: Locale;
}

export function cancellationAnnouncementParams(
  input: AnnouncementDraftInput,
): CancellationAnnouncementParams {
  const { venueName, startsAt, endsAt, locale } = input;

  return {
    venue: venueName,
    date: formatSessionDate(startsAt, locale),
    time: formatSessionTimeRange(startsAt, endsAt, locale),
  };
}
