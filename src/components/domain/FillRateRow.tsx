/**
 * One line of BUILD-SPEC 15.12 section 5 (attendance by slot) and section 6
 * (fill rate by venue). One component for both, because they ask the same
 * question of different groupings and a coach comparing them should not have
 * to translate between two layouts.
 *
 * ── Why this does not use ProgressBar ────────────────────
 * The occupancy bar of 17.3 turns amber at 85% and red at capacity, because on
 * the schedule a nearly full session is a warning: a player is about to lose
 * his spot. Here a full slot is the best thing on the page. Reusing that bar
 * would paint the healthiest row in the report red, so this draws a plain one
 * and lets the percentage carry the meaning — which it must anyway, since
 * nothing in this app is said by colour alone (17.2).
 */
import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';

export interface FillRateRowProps {
  /** Already translated, for example "Saturday 7:00 PM". */
  label: string;
  /** Venue, session count, whatever the second line of the row is. */
  detail: string;
  /** 0 to 1, or null when nothing ran and there is no rate to draw. */
  rate: number | null;
  /** Already formatted, for example "62%" or an em dash. */
  rateLabel: string;
  /** Already translated, for the bar's screen reader label. */
  accessibilityLabel: string;
  testID?: string | undefined;
}

const BAR_HEIGHT = 6;

export const FillRateRow: React.FC<FillRateRowProps> = ({
  label,
  detail,
  rate,
  rateLabel,
  accessibilityLabel,
  testID,
}) => {
  const theme = useTheme();

  return (
    <View testID={testID} style={{ gap: theme.spacing.xs, paddingVertical: theme.spacing.xs }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <Text variant="small" weight="600" style={{ flexShrink: 1 }}>
          {label}
        </Text>
        <Text variant="small" weight="600">
          {rateLabel}
        </Text>
      </View>

      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
        style={{
          height: BAR_HEIGHT,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.bgSurface,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.round((rate ?? 0) * 100)}%`,
            height: '100%',
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>

      <Text variant="caption" tone="tertiary">
        {detail}
      </Text>
    </View>
  );
};

export default FillRateRow;
