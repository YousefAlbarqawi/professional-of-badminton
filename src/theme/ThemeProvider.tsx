/**
 * The theme, consumed through `useTheme()`. BUILD-SPEC section 2.1: styling is
 * StyleSheet with a typed theme object. No Tailwind, no NativeWind, no
 * styled-components.
 *
 * The theme is a constant — there is only one, dark — so the provider exists to
 * give components a single typed accessor rather than to swap palettes. What
 * does change at runtime is the locale-dependent font family and the writing
 * direction, so both live here alongside the tokens.
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
  /** True when the app is laid out right to left. */
  isRTL: boolean;
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

    return {
      colors,
      spacing,
      radii,
      typography,
      tierBadgeColors,
      minTouchTarget: MIN_TOUCH_TARGET,
      minCourtNameSize: MIN_COURT_NAME_SIZE,
      locale,
      isRTL: I18nManager.isRTL,
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
