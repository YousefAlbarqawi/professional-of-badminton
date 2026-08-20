/**
 * Text. Typography variants from BUILD-SPEC 17.1, with automatic RTL
 * alignment and the correct font family for the active locale.
 *
 * Alignment defaults to `'auto'`, which lets React Native align by the text's
 * own direction. That is what keeps a phone number or an email address reading
 * left to right inside an Arabic paragraph. BUILD-SPEC 16.2.
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
  align = 'auto',
  weight,
  style,
  children,
  ...rest
}) => {
  const theme = useTheme();
  const base = theme.textStyle(variant);

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
          textAlign: align,
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
