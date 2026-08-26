/**
 * One subscription, as 14.13 and 15.8 section 5 both render it.
 * BUILD-SPEC 11.6, 14.13.
 *
 * "For each active subscription: package name, remaining credits as a large
 * number, granted total, expiry date, and a warning chip within 7 days of
 * expiry."
 *
 * The remaining figure is passed in rather than computed here, and it is
 * always `remainingCredits()` — the sum of the ledger, per 6.2 and D56. A
 * component that summed it itself would be a second implementation of the one
 * rule this phase is not allowed to have two of.
 *
 * There is no purchase button, no price, and no upsell. D49 and section 4
 * item 8: subscriptions cannot be bought in the app, and 14.13 says so twice.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card, Chip, Text } from '@/components/primitives';
import { ammanDayStart, formatSessionDate } from '@/lib/time';
import { useTheme } from '@/theme';

export interface SubscriptionCardProps {
  packageName: string;
  /** The sum of the ledger. Never a stored counter. */
  remaining: number;
  grantedVisits: number;
  /** `yyyy-MM-dd`. */
  expiresOn: string;
  /** 11.6: fewer than 7 days left. */
  isExpiringSoon?: boolean;
  /** Voided by the expiry job, or simply past its date. */
  isExpired?: boolean;
  /** Rendered under the figures: *Extend*, *Adjust credits*. 15.8 section 5. */
  actions?: React.ReactNode;
  testID?: string | undefined;
}

export const SubscriptionCard: React.FC<SubscriptionCardProps> = ({
  packageName,
  remaining,
  grantedVisits,
  expiresOn,
  isExpiringSoon = false,
  isExpired = false,
  actions,
  testID,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Card
      style={isExpired ? { opacity: 0.7 } : undefined}
      {...(testID === undefined ? {} : { testID })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <Text variant="heading" style={{ flex: 1 }}>
          {packageName}
        </Text>
        {/* 17.2's rule generalised: the chip carries its meaning as text, and
            the colour only repeats it. */}
        {isExpired ? (
          <Chip
            label={t('subscriptions.expired')}
            tone="neutral"
            testID={`${testID ?? 'sub'}-expired`}
          />
        ) : isExpiringSoon ? (
          <Chip
            label={t('subscriptions.expiringSoon')}
            tone="warning"
            testID={`${testID ?? 'sub'}-warning`}
          />
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
        }}
      >
        {/* "Remaining credits as a large number." 14.13. */}
        <Text variant="display" testID={`${testID ?? 'sub'}-remaining`}>
          {String(remaining)}
        </Text>
        <Text variant="body" tone="secondary" style={{ flex: 1 }}>
          {t('subscriptions.ofGranted', { granted: grantedVisits })}
        </Text>
      </View>

      <Text variant="small" tone="secondary" testID={`${testID ?? 'sub'}-expiry`}>
        {t(isExpired ? 'subscriptions.expiredOn' : 'subscriptions.expiresOn', {
          date: formatSessionDate(ammanDayStart(expiresOn), theme.locale),
        })}
      </Text>

      {actions === undefined ? null : (
        <View style={{ paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>{actions}</View>
      )}
    </Card>
  );
};

export default SubscriptionCard;
