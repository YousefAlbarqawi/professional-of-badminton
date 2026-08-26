/**
 * Chip. A small labelled pill: session type, status, "You are booked".
 * BUILD-SPEC 17.3.
 *
 * The tone carries colour, and the label always carries the meaning. Nothing
 * in this app is communicated by colour alone — see 17.2 for why.
 */
import React, { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface ChipProps {
  /** Already translated. */
  label: string;
  tone?: ChipTone;
  testID?: string | undefined;
  style?: StyleProp<ViewStyle>;
}

export const Chip: React.FC<ChipProps> = ({ label, tone = 'neutral', testID, style }) => {
  const theme = useTheme();

  const palette = useMemo(() => {
    switch (tone) {
      case 'accent':
        return { background: theme.colors.accent, label: theme.colors.accentText };
      case 'success':
        return { background: theme.colors.success, label: theme.colors.accentText };
      case 'warning':
        return { background: theme.colors.warning, label: '#1A1A1A' };
      case 'danger':
        return { background: theme.colors.danger, label: '#1A0B08' };
      case 'info':
        return { background: theme.colors.info, label: '#08202E' };
      case 'neutral':
        return { background: theme.colors.bgSurface, label: theme.colors.textSecondary };
    }
  }, [theme, tone]);

  return (
    <View
      testID={testID}
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: palette.background,
          borderRadius: theme.radii.pill,
          paddingHorizontal: theme.spacing.sm + theme.spacing.xs,
          paddingVertical: theme.spacing.xs,
        },
        style,
      ]}
    >
      <Text variant="caption" weight="600" style={{ color: palette.label }}>
        {label}
      </Text>
    </View>
  );
};

export default Chip;
