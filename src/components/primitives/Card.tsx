/**
 * Card. The surface almost every list row and detail block sits on.
 * BUILD-SPEC 17.1 and 17.3.
 *
 * Pass `onPress` to make it a row that navigates; without it the card is
 * inert and carries no accessibility role of its own.
 */
import React, { useCallback, useMemo } from 'react';
import {
  Pressable,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  /** Raises the card off the background, for a card on a card. */
  isElevated?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  isElevated = false,
  accessibilityLabel,
  testID,
  style,
}) => {
  const theme = useTheme();

  const baseStyle = useMemo<ViewStyle>(
    () => ({
      backgroundColor: isElevated ? theme.colors.bgSurface : theme.colors.bgElevated,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.md,
    }),
    [isElevated, theme],
  );

  const pressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => [
      baseStyle,
      pressed ? { backgroundColor: theme.colors.bgSurface } : null,
      style,
    ],
    [baseStyle, style, theme],
  );

  if (onPress === undefined) {
    return (
      <View testID={testID} style={[baseStyle, style]}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
      testID={testID}
      onPress={onPress}
      style={pressableStyle}
    >
      {children}
    </Pressable>
  );
};

export default Card;
