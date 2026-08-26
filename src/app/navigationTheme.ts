/**
 * React Navigation's own theme, filled in from the design tokens.
 *
 * 17.1: dark theme only, no light theme, no system theme following. Without
 * this the navigator would paint its headers, tab bar and screen backgrounds
 * in React Navigation's default light palette and flash white on every push.
 */
import { DarkTheme, type Theme as NavigationTheme } from '@react-navigation/native';

import { colors } from '@/theme';

export const navigationTheme: NavigationTheme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.danger,
  },
};
