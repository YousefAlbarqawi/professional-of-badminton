/**
 * One row of 15.8 section 2's "change history". BUILD-SPEC 15.8.
 *
 * The sentence form ("Changed from X to Y") rather than an arrow glyph is
 * `admin.balance.preview`'s own choice, reused here for the same reason: an
 * arrow does not flip correctly in Arabic, and a translated sentence reads
 * right in both directions without a manual RTL fix.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/primitives';
import { tierLabelKey, type Tier } from '@/lib/tiers';
import { formatSessionDate } from '@/lib/time';
import { useTheme } from '@/theme';

export interface TierChangeRowProps {
  fromTier: Tier | null;
  toTier: Tier | null;
  actorName: string | null;
  createdAt: Date;
  testID?: string | undefined;
}

export const TierChangeRow: React.FC<TierChangeRowProps> = ({
  fromTier,
  toTier,
  actorName,
  createdAt,
  testID,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const label = (tier: Tier | null): string => (tier === null ? t('tiers.unrated') : t(tierLabelKey(tier)));

  return (
    <View
      testID={testID}
      style={{
        gap: 2,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
    >
      <Text variant="small">
        {t('admin.profile.tier.historyChange', { from: label(fromTier), to: label(toTier) })}
      </Text>
      <Text variant="caption" tone="tertiary">
        {actorName === null
          ? formatSessionDate(createdAt, theme.locale)
          : t('admin.profile.tier.historyBy', {
              name: actorName,
              date: formatSessionDate(createdAt, theme.locale),
            })}
      </Text>
    </View>
  );
};

export default TierChangeRow;
