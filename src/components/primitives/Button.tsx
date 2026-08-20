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
      <Text
        variant="body"
        weight="600"
        align="center"
        style={{ color: palette.label, opacity: isLoading ? 0 : 1 }}
      >
        {label}
      </Text>
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
  spinner: {
    flex: 1,
  },
});

export default Button;
