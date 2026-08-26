/**
 * TierBadge. BUILD-SPEC 17.2.
 *
 * "Never colour alone, since players will be told their tier by a coach who is
 * colour blind for all we know." The letter is always drawn as text; the
 * colour band only says which family it belongs to.
 *
 * An unrated player gets a dashed outline rather than a colour, which is the
 * marker A11 asks for so the coach notices someone still needs rating.
 *
 * The badge itself never decides who may see a tier. That is the server's
 * decision, made in `get_session_attendees` (7.2): a level 0 player is handed
 * a null and this renders nothing.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/primitives';
import { tierFamily, tierLabelKey, type Tier } from '@/lib/tiers';
import { useTheme } from '@/theme';

export interface TierBadgeProps {
  tier: Tier | null;
  /** 14.7 level 1: "The player's own badge is outlined." */
  isSelf?: boolean;
  testID?: string | undefined;
  style?: StyleProp<ViewStyle>;
}

/** 17.2: "Circle or pill, 28pt minimum". */
const MIN_SIZE = 28;

export const TierBadge: React.FC<TierBadgeProps> = ({ tier, isSelf = false, testID, style }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const palette =
    tier === null ? theme.tierBadgeColors.unrated : theme.tierBadgeColors[tierFamily(tier)];
  const label = tier === null ? t('tiers.unrated') : t(tierLabelKey(tier));

  return (
    <View
      testID={testID}
      accessibilityLabel={label}
      style={[
        {
          minWidth: MIN_SIZE,
          minHeight: MIN_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.sm,
          borderRadius: theme.radii.pill,
          backgroundColor: palette.background,
          borderWidth: tier === null || isSelf ? 2 : 0,
          borderStyle: tier === null ? 'dashed' : 'solid',
          borderColor: isSelf ? theme.colors.accent : theme.colors.textTertiary,
        },
        style,
      ]}
    >
      <Text variant="small" weight="700" style={{ color: palette.text }}>
        {label}
      </Text>
    </View>
  );
};

export default TierBadge;
