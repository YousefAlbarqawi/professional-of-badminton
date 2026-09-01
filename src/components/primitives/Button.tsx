/**
 * Button. Four variants, each with loading and disabled states.
 * BUILD-SPEC 17.3 and 17.4.
 *
 * Touch target is never below 44×44. A loading button keeps its label in place
 * and overlays the spinner, so the row does not reflow mid-tap.
 */
import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  isLoading?: boolean;
  isDisabled?: boolean;
  /** Fills the available width. Primary actions usually should. */
  isFullWidth?: boolean;
  /** Leading icon, before the label. */
  icon?: IconName;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  isLoading = false,
  isDisabled = false,
  isFullWidth = false,
  icon,
  accessibilityHint,
  testID,
  style,
}) => {
  const theme = useTheme();
  const isInert = isDisabled || isLoading;

  const palette = useMemo(() => {
    switch (variant) {
      case 'primary':
        return {
          background: theme.colors.accent,
          backgroundPressed: theme.colors.accentPressed,
          label: theme.colors.accentText,
          border: 'transparent',
        };
      case 'secondary':
        return {
          background: theme.colors.bgSurface,
          backgroundPressed: theme.colors.bgElevated,
          label: theme.colors.textPrimary,
          border: theme.colors.border,
        };
      case 'ghost':
        return {
          background: 'transparent',
          backgroundPressed: theme.colors.bgElevated,
          label: theme.colors.accent,
          border: 'transparent',
        };
      case 'destructive':
        return {
          background: 'transparent',
          backgroundPressed: theme.colors.bgElevated,
          label: theme.colors.danger,
          border: theme.colors.danger,
        };
    }
  }, [theme, variant]);

  const handlePress = useCallback((): void => {
    if (isInert) return;
    onPress();
  }, [isInert, onPress]);

  const containerStyle = useCallback(
    ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => [
      styles.base,
      {
        minHeight: theme.minTouchTarget,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm + theme.spacing.xs,
        borderRadius: theme.radii.md,
        borderWidth: palette.border === 'transparent' ? 0 : 1,
        borderColor: palette.border,
        backgroundColor: pressed && !isInert ? palette.backgroundPressed : palette.background,
        opacity: isDisabled ? 0.45 : 1,
        alignSelf: isFullWidth ? 'stretch' : 'flex-start',
      },
      style,
    ],
    [isDisabled, isFullWidth, isInert, palette, style, theme],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      accessibilityState={{ disabled: isInert, busy: isLoading }}
      testID={testID}
      disabled={isInert}
      onPress={handlePress}
      style={containerStyle}
    >
      <View
        style={[
          styles.content,
          // A row sized to its content hands the label exactly the width the
          // platform measured for it, and Android under-measures Arabic in
          // Cairo by a few points — enough that `تسجيل الدخول` lays out one
          // point too narrow and the TextView drops the tail, which in RTL is
          // the last word: the button reads `تسجيل`. Stretching the row lets
          // the label lay out in the width the button actually has, so a short
          // measurement can no longer cut a word off. D72's WhatsApp row and
          // every other iconed button keep their intrinsic width.
          isFullWidth ? styles.contentFullWidth : null,
          { opacity: isLoading ? 0 : 1 },
        ]}
      >
        {icon === undefined ? null : <Icon name={icon} size={18} color={palette.label} />}
        <Text
          variant="body"
          weight="600"
          align="center"
          // Only when the button owns the width and nothing shares the row: an
          // iconed row has to stay grouped around its icon, and a button sized
          // to its content has no spare width to hand over anyway.
          style={[
            styles.label,
            isFullWidth && icon === undefined ? styles.labelFullWidth : null,
            { color: palette.label },
          ]}
        >
          {label}
        </Text>
      </View>
      {isLoading ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ActivityIndicator color={palette.label} style={styles.spinner} />
        </View>
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contentFullWidth: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  label: {
    // Never wider than the row, so a long label wraps or ellipsises inside the
    // button rather than pushing a leading icon out of it.
    flexShrink: 1,
  },
  labelFullWidth: {
    // Takes the row's whole width instead of the width Android measured for
    // the string. The measurement is the bug: Cairo's Arabic comes back a few
    // points narrower than it draws, so `تسجيل الدخول` was handed a box it did
    // not fit, wrapped onto a second line, and the button's fixed height hid
    // that line — leaving `تسجيل`. `textAlign: center` keeps it looking
    // identical to a label sized to its own text.
    flexGrow: 1,
  },
  spinner: {
    flex: 1,
  },
});

export default Button;
