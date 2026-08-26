/**
 * One row of My Bookings. BUILD-SPEC 14.9.
 *
 * "Upcoming rows: venue, date, time, payment method chip, and a cancel
 * affordance when outside the 3 hour window. Past rows show the last 30 days
 * only, greyed, no actions."
 *
 * The cancel affordance is a chevron into the detail screen rather than a
 * cancel button on the row: 17.4 requires every destructive action to confirm,
 * and 14.10 already has the button and the confirmation. A row that could
 * cancel a reservation with one tap in a scrolling list would be the one
 * control in the app that destroys something without asking.
 */
import React from 'react';
import { I18nManager, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card, Chip, Text } from '@/components/primitives';
import type { MyBooking } from '@/features/bookings/types';
import { formatSessionDate, formatSessionTimeRange } from '@/lib/time';
import { useTheme } from '@/theme';

import { PaymentMethodChip } from './PaymentMethodChip';

export interface BookingCardProps {
  booking: MyBooking;
  /** 14.9: past rows are greyed and carry no actions. */
  isPast?: boolean;
  /** 14.9: shown on an upcoming row that is still outside the 3 hour window. */
  isCancellable?: boolean;
  onPress?: (() => void) | undefined;
  testID?: string | undefined;
}

export const BookingCard: React.FC<BookingCardProps> = ({
  booking,
  isPast = false,
  isCancellable = false,
  onPress,
  testID,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = booking;

  // 16.2: a chevron implies direction and must flip.
  const chevron = I18nManager.isRTL ? '‹' : '›';

  const body = (
    <Card {...(testID === undefined ? {} : { testID })} style={{ opacity: isPast ? 0.6 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <Text variant="heading">{session.venue.name}</Text>
          <Text variant="small" tone="secondary">
            {session.venue.area}
          </Text>
          <Text variant="body">
            {`${formatSessionDate(session.startsAt, theme.locale)} · ${formatSessionTimeRange(
              session.startsAt,
              session.endsAt,
              theme.locale,
            )}`}
          </Text>
        </View>

        {isPast ? null : (
          <Text variant="title" tone="tertiary" accessibilityElementsHidden>
            {chevron}
          </Text>
        )}
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
        }}
      >
        <PaymentMethodChip
          method={booking.paymentMethod}
          testID={`${testID ?? 'booking'}-method`}
        />

        {session.status === 'cancelled' ? (
          <Chip
            label={t('schedule.cancelledBanner')}
            tone="danger"
            testID={`${testID ?? 'booking'}-cancelled`}
          />
        ) : null}

        {isCancellable ? (
          <Chip
            label={t('session.cancelReservation')}
            tone="neutral"
            testID={`${testID ?? 'booking'}-cancellable`}
          />
        ) : null}
      </View>
    </Card>
  );

  if (onPress === undefined) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={session.venue.name}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {body}
    </Pressable>
  );
};

export default BookingCard;
