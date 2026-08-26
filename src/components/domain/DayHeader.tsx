/**
 * The sticky day header on the schedule lists. 14.6 and 15.3.
 *
 * Opaque on purpose: it sits over scrolling content, and a translucent header
 * on a dark theme reads as smudge rather than as a heading.
 */
import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/primitives';
import { formatSessionDate } from '@/lib/time';
import { useTheme } from '@/theme';

export interface DayHeaderProps {
  /** Any instant inside the Amman day being headed. */
  date: Date;
  /** A quiet trailing note, for example how many sessions that day. */
  caption?: string | undefined;
  testID?: string | undefined;
}

export const DayHeader: React.FC<DayHeaderProps> = ({ date, caption, testID }) => {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={{
        backgroundColor: theme.colors.bg,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
      }}
    >
      <Text variant="heading">{formatSessionDate(date, theme.locale)}</Text>
      {caption === undefined ? null : (
        <Text variant="caption" tone="tertiary">
          {caption}
        </Text>
      )}
    </View>
  );
};

export default DayHeader;
