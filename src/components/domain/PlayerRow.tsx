/**
 * PlayerRow. BUILD-SPEC 17.3.
 *
 * One person in a list: a tier badge, a name, and whatever the screen wants to
 * put on the end. 15.2's roster puts a payment method chip there; the add
 * player search puts his credit balance there.
 *
 * The row is a button when it does something and plain text when it does not,
 * rather than a button that ignores taps, so assistive technology is told the
 * same thing the player is.
 */
import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/primitives';
import type { Tier } from '@/lib/tiers';
import { useTheme } from '@/theme';

import { TierBadge } from './TierBadge';

export interface PlayerRowProps {
  name: string;
  tier: Tier | null;
  /** A second line under the name: a guest label, a credit count, a reason. */
  caption?: string | undefined;
  /** Chips or a count, at the end of the row. */
  trailing?: React.ReactNode;
  onPress?: (() => void) | undefined;
  /** Greys the row and stops it responding. 15.2's already-booked results. */
  isDisabled?: boolean;
  testID?: string | undefined;
}

export const PlayerRow: React.FC<PlayerRowProps> = ({
  name,
  tier,
  caption,
  trailing,
  onPress,
  isDisabled = false,
  testID,
}) => {
  const theme = useTheme();
  const isPressable = onPress !== undefined && !isDisabled;

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        // 17.4: minimum touch target 44x44.
        minHeight: 44,
        opacity: isDisabled ? 0.5 : 1,
      }}
    >
      <TierBadge tier={tier} />

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{name}</Text>
        {caption === undefined ? null : (
          <Text variant="caption" tone="tertiary">
            {caption}
          </Text>
        )}
      </View>

      {trailing}
    </View>
  );

  if (!isPressable) {
    return (
      <View testID={testID} accessible accessibilityLabel={name}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
};

export default PlayerRow;
