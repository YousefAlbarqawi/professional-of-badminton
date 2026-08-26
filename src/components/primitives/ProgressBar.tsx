/**
 * ProgressBar. BUILD-SPEC 17.3.
 *
 * Used for session occupancy, which is why the fill turns amber as a session
 * approaches capacity and red when it is full. The bar is never the only thing
 * saying so: 14.6 pairs it with "8 of 16 booked" in words.
 *
 * It does not mirror in Arabic by accident and it does not need to — it grows
 * from the reading start edge in both directions, which is what `flexDirection`
 * `row` gives under RTL.
 */
import React, { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface ProgressBarProps {
  /** How many of `total` are taken. Clamped into range. */
  value: number;
  total: number;
  /** Already translated, for screen readers. */
  accessibilityLabel: string;
  testID?: string | undefined;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT = 6;
const NEARLY_FULL = 0.85;

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  total,
  accessibilityLabel,
  testID,
  style,
}) => {
  const theme = useTheme();

  const { fraction, color } = useMemo(() => {
    if (total <= 0) return { fraction: 0, color: theme.colors.accent };

    const ratio = Math.min(1, Math.max(0, value / total));
    if (ratio >= 1) return { fraction: 1, color: theme.colors.danger };
    if (ratio >= NEARLY_FULL) return { fraction: ratio, color: theme.colors.warning };
    return { fraction: ratio, color: theme.colors.accent };
  }, [theme, total, value]);

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: total, now: Math.min(value, total) }}
      style={[
        {
          height: HEIGHT,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.bgSurface,
          overflow: 'hidden',
          flexDirection: 'row',
        },
        style,
      ]}
    >
      <View
        testID={testID === undefined ? undefined : `${testID}-fill`}
        style={{
          width: `${fraction * 100}%`,
          backgroundColor: color,
          borderRadius: theme.radii.pill,
        }}
      />
    </View>
  );
};

export default ProgressBar;
