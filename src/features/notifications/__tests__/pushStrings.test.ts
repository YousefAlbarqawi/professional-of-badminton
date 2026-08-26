/**
 * The edge function holds a second copy of four strings and a time format.
 * This is what makes that copy safe.
 *
 * BUILD-SPEC section 18 requires the payload's language to come from the
 * device row, which puts both languages on the server, and 16.1 forbids
 * hardcoded strings — so the copy has to be provably the deck. Section 5.1 and
 * 16.1 fix the time format, and `src/lib/time.ts` is the app's implementation
 * of it; the edge function's is a second one, for the reason its header gives,
 * so it has to agree instant for instant.
 *
 * Both modules are imported by relative path because `supabase/functions` is
 * outside the `@/` alias. They are plain TypeScript with no Deno APIs, which
 * is precisely so this test can load them.
 */
import { formatAmmanTime } from '../../../../supabase/functions/_shared/ammanTime';
import {
  announcementContent,
  waitlistContent,
  PUSH_STRINGS,
} from '../../../../supabase/functions/_shared/pushStrings';
import ar from '@/i18n/ar.json';
import en from '@/i18n/en.json';
import { formatSessionTime } from '@/lib/time';

describe('the push string table is the deck', () => {
  it('matches en.json character for character', () => {
    expect(PUSH_STRINGS.en).toEqual({
      waitlistTitle: en.notifications.waitlistTitle,
      waitlistBody: en.notifications.waitlistBody,
      announcementTitle: en.notifications.announcementTitle,
      announcementBody: en.notifications.announcementBody,
    });
  });

  it('matches ar.json character for character', () => {
    expect(PUSH_STRINGS.ar).toEqual({
      waitlistTitle: ar.notifications.waitlistTitle,
      waitlistBody: ar.notifications.waitlistBody,
      announcementTitle: ar.notifications.announcementTitle,
      announcementBody: ar.notifications.announcementBody,
    });
  });
});

describe('composing section 18 row 1', () => {
  it('interpolates rather than concatenating', () => {
    expect(waitlistContent({ venue: 'Khalda', time: '7:00 PM' }, 'en')).toEqual({
      title: 'A spot opened',
      body: 'Khalda, 7:00 PM. First to reserve gets it.',
    });
  });

  it('keeps the Arabic word order and the Arabic comma', () => {
    const content = waitlistContent({ venue: 'خلدا', time: '7:00 مساءً' }, 'ar');
    expect(content.title).toBe(ar.notifications.waitlistTitle);
    expect(content.body).toContain('خلدا،');
    expect(content.body).toContain('7:00 مساءً');
    expect(content.body).not.toContain('{{');
  });

  it('leaves no placeholder behind when a value is missing', () => {
    expect(waitlistContent({ venue: '', time: '' }, 'en').body).not.toContain('{{');
  });
});

describe('composing section 18 row 2', () => {
  it('titles it with the academy name in both languages', () => {
    // D69: the body stays in whatever language the author typed, whatever the
    // reading device is set to. Only the title is the app's.
    expect(announcementContent({ preview: 'التدريب ألغي' }, 'en')).toEqual({
      title: 'Professional of Badminton',
      body: 'التدريب ألغي',
    });
    expect(announcementContent({ preview: 'Session cancelled' }, 'ar')).toEqual({
      title: 'Professional of Badminton',
      body: 'Session cancelled',
    });
  });
});

describe('the edge function tells the same time as the app', () => {
  // Every half hour of one day, plus the boundaries that catch a 12-hour bug.
  const instants: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      const hh = String(hour).padStart(2, '0');
      const mm = String(minute).padStart(2, '0');
      instants.push(`2026-08-21T${hh}:${mm}:00Z`);
    }
  }

  it.each(instants)('agrees with formatSessionTime at %s, in English', (iso) => {
    expect(formatAmmanTime(iso, 'en')).toBe(formatSessionTime(new Date(iso), 'en'));
  });

  it.each(instants)('agrees with formatSessionTime at %s, in Arabic', (iso) => {
    expect(formatAmmanTime(iso, 'ar')).toBe(formatSessionTime(new Date(iso), 'ar'));
  });

  it('renders Amman noon and midnight as 12, not 0', () => {
    // Amman is UTC+3 (5.1), so 09:00Z is noon and 21:00Z is midnight.
    expect(formatAmmanTime('2026-08-21T09:00:00Z', 'en')).toBe('12:00 PM');
    expect(formatAmmanTime('2026-08-21T21:00:00Z', 'en')).toBe('12:00 AM');
  });

  it('returns an empty string rather than "Invalid Date"', () => {
    expect(formatAmmanTime('', 'en')).toBe('');
    expect(formatAmmanTime('not a date', 'ar')).toBe('');
  });
});
