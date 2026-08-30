/**
 * Text. Typography variants from BUILD-SPEC 17.1, with automatic RTL
 * alignment and the correct font family for the active locale.
 *
 * Alignment defaults to `theme.alignStart` — the reading start of the app's
 * *language*, not RN's `'auto'`/`textAlign: 'natural'`. Three independent
 * things were wrong before this default was picked, the first two found on a
 * device (not just in unit tests, which cannot see either):
 *
 * 1. `'auto'` on iOS follows the *device's* OS locale rather than the
 *    string's content or the app's own chosen language, so it silently kept
 *    text left-aligned in Arabic on a device whose OS locale was English —
 *    exactly the case BUILD-SPEC 16.1 says the app must get right, since it
 *    deliberately starts every install in Arabic regardless of device locale.
 * 2. React Native treats a *literal* `'left'`/`'right'` on `textAlign` as a
 *    logical, not physical, value once `I18nManager.isRTL` is true: it
 *    auto-mirrors them the same way it mirrors `flexDirection: 'row'`, so
 *    `'right'` under RTL renders physically left, and `'left'` renders
 *    physically right. Confirmed directly on device: a raw RN `<Text>` with
 *    hardcoded `textAlign: 'right'` still rendered flush left under
 *    `I18nManager.isRTL === true`, and swapping to `'left'` was what
 *    actually moved it to the right edge.
 * 3. A hardcoded `'left'` is therefore only correct while the native layout
 *    direction and the app language agree about direction. They do not always:
 *    `I18nManager.forceRTL()` needs a reload to take hold, so a switch to
 *    English can leave `isRTL === true` for a launch and every label lands on
 *    the right of an English screen. `theme.alignStart` compares the two and
 *    cancels the mirroring out — see `theme/ThemeProvider.tsx`.
 *
 * An LTR phone number or email address inside an Arabic paragraph still
 * reads correctly either way — that is Core Text's own per-character bidi
 * shaping, not `textAlign`, so it is unaffected by this default. Pass an
 * explicit `align` for the rare case that wants center/justify/etc.
 */
import React from 'react';
import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';
import type { TypographyVariant } from '@/theme/tokens';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'warning';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  /** Overrides the variant's weight, for the odd emphasised word. */
  weight?: '400' | '600' | '700';
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

export const Text: React.FC<AppTextProps> = ({
  variant = 'body',
  tone = 'primary',
  align,
  weight,
  style,
  children,
  ...rest
}) => {
  const theme = useTheme();
  const base = theme.textStyle(variant);
  const resolvedAlign = align ?? theme.alignStart;

  const toneColor: Record<TextTone, string> = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    tertiary: theme.colors.textTertiary,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
    warning: theme.colors.warning,
  };

  const resolvedWeight = weight ?? base.fontWeight;

  return (
    <RNText
      {...rest}
      style={[
        {
          fontSize: base.fontSize,
          lineHeight: base.lineHeight,
          fontWeight: resolvedWeight,
          fontFamily: theme.fontFamily(resolvedWeight),
          color: toneColor[tone],
          textAlign: resolvedAlign,
          // Arabic ascenders and descenders need the full line box.
          includeFontPadding: false,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

/**
 * Wraps a value in Unicode isolates so it always reads left to right, whatever
 * the surrounding paragraph does. For phone numbers and email addresses.
 * BUILD-SPEC 16.2.
 */
export function isolateLTR(value: string): string {
  return `⁦${value}⁩`;
}

export default Text;
