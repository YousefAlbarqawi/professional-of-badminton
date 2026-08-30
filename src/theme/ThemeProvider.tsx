/**
 * The theme, consumed through `useTheme()`. BUILD-SPEC section 2.1: styling is
 * StyleSheet with a typed theme object. No Tailwind, no NativeWind, no
 * styled-components.
 *
 * The theme is a constant — there is only one, dark — so the provider exists to
 * give components a single typed accessor rather than to swap palettes. What
 * does change at runtime is the locale-dependent font family and the writing
 * direction, so both live here alongside the tokens.
 *
 * ── Two directions, not one ───────────────────────────────
 * `isRTL` is the *native layout* direction, and `localeIsRTL` is the direction
 * the app's own language wants. They normally agree, but they can disagree for
 * one render cycle or one whole launch, because `I18nManager.forceRTL()` only
 * takes effect after a reload (see `i18n/useChangeLanguage.ts`) and a reload
 * that does not happen leaves English text laid out right to left.
 *
 * ── Two alignments, because RN has two behaviours ─────────
 * There are two families of value here and using the wrong one puts text on
 * the wrong edge, so the distinction is worth stating plainly:
 *
 * `alignStart`/`alignEnd` are for **`<Text>`**. React Native treats a literal
 * `'left'`/`'right'` on a `Text`'s `textAlign` as a **logical** value once
 * `I18nManager.isRTL` is true — it mirrors them exactly as it mirrors
 * `flexDirection: 'row'` — so `'left'` means "reading start" while the two
 * directions agree and means the wrong edge the moment they do not. Comparing
 * them cancels the mirroring out: when they agree `'left'` is already start,
 * and when they disagree `'right'` mirrors back into start.
 *
 * `inputAlignStart` is for **`<TextInput>`**, which does *not* get that
 * treatment. The same prop on the same-looking component is taken physically:
 * `'right'` is the right of the screen, mirrored layout or not. Handing a
 * field the mirror-compensated value put the caret on the wrong edge in both
 * languages at once — Arabic typing from the left and English from the right —
 * which is what this pair exists to stop happening again.
 *
 * So: `Text` gets `alignStart`, `TextInput` gets `inputAlignStart`, and the
 * physical one is derived from the *locale* alone, which makes it correct
 * whether or not the native layout direction has caught up with a language
 * change yet.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { I18nManager } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Locale } from '@/lib/money';

import { fontFamilyFor, type FontWeight } from './fonts';
import {
  MIN_COURT_NAME_SIZE,
  MIN_TOUCH_TARGET,
  colors,
  radii,
  spacing,
  tierBadgeColors,
  typography,
  type TypographyVariant,
} from './tokens';

export interface Theme {
  colors: typeof colors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  tierBadgeColors: typeof tierBadgeColors;
  minTouchTarget: number;
  minCourtNameSize: number;
  /** The active locale, which decides the font family. */
  locale: Locale;
  /** True when the *native layout* is right to left. Mirrors rows and margins. */
  isRTL: boolean;
  /** True when the active *locale* is right to left. Arabic, and only Arabic. */
  localeIsRTL: boolean;
  /** `<Text>`'s `textAlign` for the reading start of the locale. Mirror-aware. */
  alignStart: 'left' | 'right';
  /** `<Text>`'s `textAlign` for the reading end of the locale. Mirror-aware. */
  alignEnd: 'left' | 'right';
  /**
   * `<TextInput>`'s `textAlign` for the reading start of the locale. Physical:
   * RN does not mirror this one. Never interchangeable with `alignStart` —
   * see the note at the top of this file.
   */
  inputAlignStart: 'left' | 'right';
  /** The font family for a weight in the active locale, or undefined for system. */
  fontFamily: (weight: FontWeight) => string | undefined;
  /** Everything needed to render a typography variant in the active locale. */
  textStyle: (variant: TypographyVariant) => {
    fontSize: number;
    lineHeight: number;
    fontWeight: '400' | '600' | '700';
    fontFamily: string | undefined;
  };
}

const ThemeContext = createContext<Theme | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const locale: Locale = i18n.language === 'ar' ? 'ar' : 'en';

  const theme = useMemo<Theme>(() => {
    const fontFamily = (weight: FontWeight): string | undefined => fontFamilyFor(locale, weight);
    const isRTL = I18nManager.isRTL;
    const localeIsRTL = locale === 'ar';
    const alignStart: 'left' | 'right' = localeIsRTL === isRTL ? 'left' : 'right';
    // No `isRTL` term on purpose: a text field is aligned physically, so the
    // language alone decides, and the answer holds whichever way the native
    // layout direction happens to be pointing.
    const inputAlignStart: 'left' | 'right' = localeIsRTL ? 'right' : 'left';

    return {
      colors,
      spacing,
      radii,
      typography,
      tierBadgeColors,
      minTouchTarget: MIN_TOUCH_TARGET,
      minCourtNameSize: MIN_COURT_NAME_SIZE,
      locale,
      isRTL,
      localeIsRTL,
      alignStart,
      alignEnd: alignStart === 'left' ? 'right' : 'left',
      inputAlignStart,
      fontFamily,
      textStyle: (variant) => {
        const token = typography[variant];
        return {
          fontSize: token.size,
          lineHeight: token.lineHeight,
          fontWeight: token.weight,
          fontFamily: fontFamily(token.weight),
        };
      },
    };
  }, [locale]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme() must be called inside a ThemeProvider');
  }
  return theme;
}
