/**
 * BUILD-SPEC 15.12 section 1: revenue "with a bar per week".
 *
 * Horizontal bars rather than vertical columns. A month is four or five weeks,
 * a phone is tall, and a horizontal bar can carry its own label and its own
 * figure on the same line without either being rotated or truncated — which
 * matters twice over in Arabic, where the row mirrors and the text must still
 * read from its own start edge.
 *
 * Every bar is drawn as a fraction of the largest, so the shape of the month
 * is visible even when the amounts are close. The figure is always written
 * out: the bar is the shape, the text is the number (17.2).
 */
import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/primitives/Text';
import { formatMoney, type Fils } from '@/lib/money';
import { useTheme } from '@/theme';

export interface WeeklyRevenueBar {
  /** Already translated and formatted, for example "5 July". */
  label: string;
  totalFils: Fils;
}

export interface WeeklyRevenueChartProps {
  bars: WeeklyRevenueBar[];
  /** The tallest bar in the set. Zero renders every bar empty rather than full. */
  maxFils: Fils;
  testID?: string | undefined;
}

const BAR_HEIGHT = 8;

export const WeeklyRevenueChart: React.FC<WeeklyRevenueChartProps> = ({
  bars,
  maxFils,
  testID,
}) => {
  const theme = useTheme();

  return (
    <View testID={testID} style={{ gap: theme.spacing.sm }}>
      {bars.map((bar) => {
        const fraction = maxFils > 0 ? Math.min(1, Math.max(0, bar.totalFils / maxFils)) : 0;

        return (
          <View key={bar.label} style={{ gap: theme.spacing.xs / 2 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: theme.spacing.sm,
              }}
            >
              <Text variant="caption" tone="secondary">
                {bar.label}
              </Text>
              <Text variant="caption" weight="600">
                {formatMoney(bar.totalFils, theme.locale)}
              </Text>
            </View>

            <View
              style={{
                height: BAR_HEIGHT,
                borderRadius: theme.radii.pill,
                backgroundColor: theme.colors.bgSurface,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${fraction * 100}%`,
                  height: '100%',
                  borderRadius: theme.radii.pill,
                  backgroundColor: theme.colors.accent,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
};

export default WeeklyRevenueChart;
