/**
 * The four strings a push notification can contain, in both languages.
 *
 * BUILD-SPEC section 18's table, and the `notifications` namespace of the
 * string deck. Section 18: "Language for the payload comes from the device
 * row, not the sender" — so both languages have to be reachable from the
 * server, and the deck lives on the phone.
 *
 * This is therefore a second copy of four entries, which 16.1's rule against
 * hardcoded strings would normally forbid. Two things make it honest:
 *
 *   - it is not a screen. Nothing here is rendered by the app; the phone reads
 *     these strings back off the notification the server composed.
 *   - `src/features/notifications/__tests__/pushStrings.test.ts` asserts this
 *     table is character-for-character the `notifications` namespace of both
 *     `en.json` and `ar.json`. Edit one and the suite fails.
 *
 * The alternative — importing the decks into Deno — reaches outside the
 * functions directory the Supabase CLI mounts, so it does not survive a
 * deploy.
 *
 * Deliberately free of imports and of Deno APIs: loaded by the edge function
 * under Deno and by Jest under Node, and it has to mean the same thing in
 * both. The formatted time is passed in rather than computed here, so this
 * file stays a table.
 */

export type PushLocale = 'ar' | 'en';

export const PUSH_STRINGS = {
  en: {
    waitlistTitle: 'A spot opened',
    waitlistBody: '{{venue}}, {{time}}. First to reserve gets it.',
    announcementTitle: 'Professional of Badminton',
    announcementBody: '{{preview}}',
  },
  ar: {
    waitlistTitle: 'تفرّغ مكان',
    waitlistBody: '{{venue}}، {{time}}. من يحجز أولًا يأخذه.',
    announcementTitle: 'Professional of Badminton',
    announcementBody: '{{preview}}',
  },
} as const;

export interface PushContent {
  title: string;
  body: string;
}

/**
 * Interpolation, not concatenation. 16.1: "Never concatenate translated
 * fragments." The template owns the punctuation and the word order, which in
 * Arabic is not the English order with the words swapped — note the Arabic
 * comma in `waitlistBody`.
 */
function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? '');
}

/** Section 18, row 1. The venue name and the time are the reader's language. */
export function waitlistContent(
  values: { venue: string; time: string },
  locale: PushLocale,
): PushContent {
  const strings = PUSH_STRINGS[locale];

  return {
    title: strings.waitlistTitle,
    body: interpolate(strings.waitlistBody, values),
  };
}

/**
 * Section 18, row 2. The title is the academy's name in both languages, and
 * the body is the announcement itself — which stays in whatever language the
 * author typed (D69), whatever the reading device is set to.
 */
export function announcementContent(values: { preview: string }, locale: PushLocale): PushContent {
  const strings = PUSH_STRINGS[locale];

  return {
    title: strings.announcementTitle,
    body: interpolate(strings.announcementBody, values),
  };
}
