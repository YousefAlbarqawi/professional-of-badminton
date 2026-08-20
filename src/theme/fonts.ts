/**
 * Fonts. System font for English (SF Pro on iOS, Roboto on Android), Cairo for
 * Arabic, bundled and loaded before the first render so there is no flash.
 * BUILD-SPEC section 17.1.
 */
// Imported from the per-weight subpaths, not the package root: the root index
// re-exports all nine weights, and Metro would bundle every one of them.
import { Cairo_400Regular } from '@expo-google-fonts/cairo/400Regular';
import { Cairo_700Bold } from '@expo-google-fonts/cairo/700Bold';

import type { Locale } from '@/lib/money';

/** The two weights section 17.1 asks for. */
export const CAIRO_FONTS = {
  Cairo_400Regular,
  Cairo_700Bold,
} as const;

export type FontWeight = '400' | '600' | '700';

/**
 * The family name for a given locale and weight. English returns undefined,
 * which lets React Native fall through to the platform system font — the
 * behaviour section 17.1 asks for, and the one that respects a user who has
 * changed their system font size.
 *
 * Cairo ships 400 and 700 only, so the 600 used by the `heading` variant maps
 * to 700. Arabic has no synthetic-bold problem to worry about here because the
 * real bold is bundled.
 */
export function fontFamilyFor(locale: Locale, weight: FontWeight): string | undefined {
  if (locale !== 'ar') return undefined;
  return weight === '400' ? 'Cairo_400Regular' : 'Cairo_700Bold';
}
