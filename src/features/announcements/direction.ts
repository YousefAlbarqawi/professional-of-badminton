/**
 * Which way one announcement reads.
 *
 * BUILD-SPEC 14.11: "Text is displayed in whatever language it was written in,
 * with the correct text direction detected per message rather than following
 * the app language."
 *
 * That sentence is the whole of this file's reason to exist. Everywhere else
 * in the app, direction is the app's direction (16.2), because everywhere else
 * the text is the deck's and the deck is in the reader's language. An
 * announcement is not: D69 says it is "one message to everyone, in whichever
 * language the author types", so an Arabic player reading an English notice
 * must see it left to right inside a right to left screen, and the other way
 * round.
 *
 * ── How it decides ───────────────────────────────────────
 * The first strong directional character wins, which is the rule Unicode's own
 * bidi algorithm opens with (UAX #9's P2). Digits, punctuation, spaces and
 * emoji are neutral and are skipped: "2026 — تدريب الجمعة" is Arabic, and
 * "7:00 PM Friday" is English, and neither answer comes from the character it
 * starts with.
 *
 * When there is no strong character at all — a message that is only a number,
 * or only emoji — the author's declared language decides, because he chose it
 * on the composer and it is the only other evidence there is.
 */
import type { Locale } from '@/lib/money';

export type TextDirection = 'ltr' | 'rtl';

/**
 * Strong right-to-left characters: Hebrew, Arabic, Syriac, Thaana, the Arabic
 * supplement and extended blocks, and the two presentation-forms ranges an
 * older keyboard or a copied PDF can produce.
 */
const STRONG_RTL =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/**
 * Strong left-to-right characters. The Latin alphabet and its accented forms,
 * plus Greek and Cyrillic, which nobody will type but which are strong LTR and
 * would otherwise fall through to the author's language. The two arithmetic
 * signs sitting among the Latin-1 letters are cut out, because they are
 * neutral and a message could plausibly open with one.
 */
const STRONG_LTR = /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02AF\u0370-\u04FF]/;

/** The direction of the first strong character, or `null` when there is none. */
export function detectTextDirection(text: string): TextDirection | null {
  for (const character of text) {
    if (STRONG_RTL.test(character)) return 'rtl';
    if (STRONG_LTR.test(character)) return 'ltr';
  }
  return null;
}

/**
 * The direction to render one announcement in: what the body says, falling
 * back to what the author said he was writing.
 */
export function announcementDirection(body: string, language: Locale): TextDirection {
  return detectTextDirection(body) ?? (language === 'en' ? 'ltr' : 'rtl');
}

/**
 * The alignment that goes with a direction.
 *
 * `writingDirection` alone is not enough on either platform: it orders the runs
 * within a line but does not decide which edge a short line sits against, and
 * an English notice left dangling on the right of an Arabic screen is exactly
 * what 14.11 is asking to avoid.
 *
 * ── Why `isLayoutRTL` is a parameter ──────────────────────
 * React Native mirrors a literal `'left'`/`'right'` on `textAlign` whenever
 * `I18nManager.isRTL` is true, exactly as it mirrors `flexDirection: 'row'`.
 * So a bare `textAlign: 'right'` for an Arabic message rendered physically
 * *left* on an Arabic (RTL) screen, and an English message rendered right —
 * the two languages arrived swapped, which is the one outcome 14.11 exists to
 * prevent. Comparing the wanted direction against the layout direction cancels
 * the mirroring: when they agree `'left'` already means the message's own
 * start edge, and when they disagree `'right'` mirrors back into it.
 *
 * The caller passes `theme.isRTL` rather than reading `I18nManager` here, so
 * this stays a pure function and the tests can drive both layouts.
 */
export function directionStyle(
  direction: TextDirection,
  isLayoutRTL: boolean,
): {
  writingDirection: TextDirection;
  textAlign: 'left' | 'right';
} {
  return {
    writingDirection: direction,
    textAlign: (direction === 'rtl') === isLayoutRTL ? 'left' : 'right',
  };
}
