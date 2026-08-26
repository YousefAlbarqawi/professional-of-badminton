/**
 * SessionCard. BUILD-SPEC 14.6, reused by 15.1 and 15.3.
 *
 * "Venue name and area, start and end time, session type chip, price or the
 * player's custom rate, occupancy, a booked chip when the player already has a
 * spot, right chevron."
 *
 * The chevron is a character rather than an icon font, and it flips with the
 * writing direction because it is one of the icons 16.2 says must flip.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card, Chip, Text } from '@/components/primitives';
import { formatMoney, type Fils } from '@/lib/money';
import { formatSessionTimeRange } from '@/lib/time';
import { useTheme } from '@/theme';
import type {
  Occupancy,
  SessionStatus,
  SessionType,
  VenueSummary,
} from '@/features/sessions/types';

import { OccupancyBar } from './OccupancyBar';

export interface SessionCardProps {
  venue: VenueSummary;
  startsAt: Date;
  endsAt: Date;
  sessionType: SessionType;
  /** Already resolved: the player's own rate when he has one. D41. */
  priceFils: Fils;
  occupancy: Occupancy;
  status: SessionStatus;
  /** 14.6: a booked chip when the player already has a spot. */
  isBooked?: boolean;
  /** 14.7's closed state and 15.3's struck-through cancelled rows. */
  isClosed?: boolean;
  onPress?: (() => void) | undefined;
  /** Extra chips from the admin screens: status, "Cancelled". */
  trailing?: React.ReactNode;
  testID?: string | undefined;
}

export const SessionCard: React.FC<SessionCardProps> = ({
  venue,
  startsAt,
  endsAt,
  sessionType,
  priceFils,
  occupancy,
  status,
  isBooked = false,
  isClosed = false,
  onPress,
  trailing,
  testID,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const isCancelled = status === 'cancelled';
  const timeRange = formatSessionTimeRange(startsAt, endsAt, theme.locale);

  return (
    <Card
      {...(onPress === undefined ? {} : { onPress })}
      accessibilityLabel={`${venue.name}, ${timeRange}`}
      {...(testID === undefined ? {} : { testID })}
      style={{ opacity: isCancelled || isClosed ? 0.55 : 1 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            variant="heading"
            style={isCancelled ? { textDecorationLine: 'line-through' } : undefined}
          >
            {venue.name}
          </Text>
          <Text variant="small" tone="secondary">
            {venue.area}
          </Text>
        </View>

        {onPress === undefined ? null : (
          <Text variant="heading" tone="tertiary" accessibilityElementsHidden>
            {theme.isRTL ? '‹' : '›'}
          </Text>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Text variant="body" weight="600">
          {timeRange}
        </Text>
        <Text variant="body" tone="secondary">
          {formatMoney(priceFils, theme.locale)}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <Chip
          label={t(sessionType === 'extended' ? 'session.extended' : 'session.standard')}
          testID={testID === undefined ? undefined : `${testID}-type`}
        />
        {isBooked ? (
          <Chip
            label={t('schedule.booked')}
            tone="accent"
            testID={testID === undefined ? undefined : `${testID}-booked`}
          />
        ) : null}
        {isCancelled ? (
          <Chip
            label={t('schedule.cancelledBanner')}
            tone="danger"
            testID={testID === undefined ? undefined : `${testID}-cancelled`}
          />
        ) : null}
        {isClosed && !isCancelled ? (
          <Chip
            label={t('schedule.closed')}
            tone="warning"
            testID={testID === undefined ? undefined : `${testID}-closed`}
          />
        ) : null}
        {trailing}
      </View>

      {/* A cancelled session has no occupancy worth reading. */}
      {isCancelled ? null : (
        <OccupancyBar
          occupancy={occupancy}
          testID={testID === undefined ? undefined : `${testID}-occupancy`}
        />
      )}
    </Card>
  );
};

export default SessionCard;
