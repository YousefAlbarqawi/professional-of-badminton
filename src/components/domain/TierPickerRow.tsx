/**
 * A row of ten chips — D58's nine tiers plus "Unrated" — for picking one.
 * BUILD-SPEC 15.8 section 2 and 15.2's *Change tier* row action, the two
 * places a coach sets a player's tier by hand.
 *
 * Strongest first, the same order `PlayerListScreen`'s tier filter uses,
 * because that is how a coach says them.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/primitives';
import { TIERS, type Tier } from '@/lib/tiers';
import { useTheme } from '@/theme';

export interface TierPickerRowProps {
  value: Tier | null;
  onChange: (tier: Tier | null) => void;
  isDisabled?: boolean;
  testID?: string;
}

interface ChipProps {
  label: string;
  isOn: boolean;
  isDisabled: boolean;
  onPress: () => void;
  testID?: string;
}

const Chip: React.FC<ChipProps> = ({ label, isOn, isDisabled, onPress, testID }) => (
  <View accessibilityRole="button" accessibilityState={{ selected: isOn }}>
    <Button
      label={label}
      onPress={onPress}
      variant={isOn ? 'primary' : 'ghost'}
      isDisabled={isDisabled}
      {...(testID === undefined ? {} : { testID })}
    />
  </View>
);

export const TierPickerRow: React.FC<TierPickerRowProps> = ({
  value,
  onChange,
  isDisabled = false,
  testID,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}
      testID={testID}
    >
      <Chip
        label={t('tiers.unrated')}
        isOn={value === null}
        isDisabled={isDisabled}
        onPress={() => onChange(null)}
        {...(testID === undefined ? {} : { testID: `${testID}-unrated` })}
      />
      {[...TIERS].reverse().map((tier) => (
        <Chip
          key={tier}
          label={tier}
          isOn={value === tier}
          isDisabled={isDisabled}
          onPress={() => onChange(tier)}
          {...(testID === undefined ? {} : { testID: `${testID}-${tier}` })}
        />
      ))}
    </View>
  );
};

export default TierPickerRow;
