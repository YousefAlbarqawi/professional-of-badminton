/**
 * The credits summary. BUILD-SPEC 14.12 and 11.6.
 *
 * 14.12 lists "a credits summary card, tappable through to subscriptions" on
 * the profile screen. A30 deferred it from phase 2 to this one, because the
 * balance query and the screen it taps through to are both phase 6's. This is
 * that card, and 14.13 reuses it as its own header.
 *
 * 11.6: "Total credits remaining across all active subscriptions." One number,
 * and the nearest expiry beside it, because that is the credit the next
 * booking will spend (11.4).
 *
 * There is no purchase affordance, here or anywhere. D49.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card, Chip, Text } from '@/components/primitives';
import { ammanDayStart, formatSessionDate } from '@/lib/time';
import { useTheme } from '@/theme';

export interface CreditSummaryCardProps {
  /** The sum of every live subscription's ledger. D56. */
  total: number;
  /** 11.4's nearest expiry, as `yyyy-MM-dd`, or null when nothing is live. */
  nextExpiry: string | null;
  /** 11.6: fewer than 7 days to the nearest expiry. */
  isExpiringSoon?: boolean;
  onPress?: (() => void) | undefined;
  testID?: string | undefined;
}

export const CreditSummaryCard: React.FC<CreditSummaryCardProps> = ({
  total,
  nextExpiry,
  isExpiringSoon = false,
  onPress,
  testID,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Card
      accessibilityLabel={t('subscriptions.creditsRemaining', { count: total })}
      {...(testID === undefined ? {} : { testID })}
      {...(onPress === undefined ? {} : { onPress })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Text variant="heading" style={{ flex: 1 }}>
          {t('subscriptions.title')}
        </Text>
        {isExpiringSoon ? (
          <Chip label={t('subscriptions.expiringSoon')} tone="warning" testID="credits-warning" />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
        <Text variant="display" testID="credits-total">
          {String(total)}
        </Text>
        <Text variant="body" tone="secondary" style={{ flex: 1 }}>
          {t('subscriptions.creditsRemaining', { count: total })}
        </Text>
      </View>

      <Text variant="small" tone="secondary" testID="credits-expiry">
        {nextExpiry === null
          ? t('subscriptions.noneActive')
          : t('subscriptions.nextExpiry', {
              date: formatSessionDate(ammanDayStart(nextExpiry), theme.locale),
            })}
      </Text>
    </Card>
  );
};

export default CreditSummaryCard;
