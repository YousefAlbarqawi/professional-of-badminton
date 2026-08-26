/**
 * OccupancyBar. BUILD-SPEC 17.3, used by 14.6 and 15.1.
 *
 * "Occupancy: a filled progress bar plus text, '8 of 16 booked' or '4 spots
 * left'." Both lines are shown, because the bar alone is a shape and the
 * numbers are what a player actually decides on.
 *
 * 14.6: "Occupancy display is identical at every visibility level. The count
 * is not private. Only names and tiers are." Nothing here takes a visibility
 * level, and nothing should ever pass it one.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ProgressBar, Text } from '@/components/primitives';
import { useTheme } from '@/theme';
import type { Occupancy } from '@/features/sessions/types';

export interface OccupancyBarProps {
  occupancy: Occupancy;
  testID?: string | undefined;
}

export const OccupancyBar: React.FC<OccupancyBarProps> = ({ occupancy, testID }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const countLabel = t('schedule.bookedCount', {
    count: occupancy.taken,
    capacity: occupancy.capacity,
  });
  // i18next plurals, not an `if`. Arabic has six forms. 16.1.
  const spotsLabel = t('schedule.spotsLeft', { count: occupancy.remaining });

  return (
    <View style={{ gap: theme.spacing.xs }} testID={testID}>
      <ProgressBar
        value={occupancy.taken}
        total={occupancy.capacity}
        accessibilityLabel={countLabel}
        testID={testID === undefined ? undefined : `${testID}-bar`}
      />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <Text variant="caption" tone="secondary" testID={`${testID ?? 'occupancy'}-count`}>
          {countLabel}
        </Text>
        <Text
          variant="caption"
          tone={occupancy.remaining <= 0 ? 'warning' : 'secondary'}
          testID={`${testID ?? 'occupancy'}-remaining`}
        >
          {spotsLabel}
        </Text>
      </View>
    </View>
  );
};

export default OccupancyBar;
