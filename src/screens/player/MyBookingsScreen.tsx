/**
 * My bookings. BUILD-SPEC 14.9.
 *
 * "Two segments: Upcoming and Past. Upcoming rows: venue, date, time, payment
 * method chip, and a cancel affordance when outside the 3 hour window. Past
 * rows show the last 30 days only, greyed, no actions."
 *
 * Both cuts — which segment a booking is in, and how far back the past goes —
 * are made by `splitBookings`, which is pure and tested. This screen chooses a
 * segment and draws rows.
 *
 * A cancelled *session* still appears under Upcoming, with the red chip, until
 * it has been and gone: 14.7 has a banner for exactly that and this is where
 * the player would look for it. A booking he cancelled himself is in neither
 * list, because it is no longer a reservation.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BookingCard } from '@/components/domain';
import { SegmentedControl, SkeletonCard, WhatsAppButton } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { canCancel } from '@/features/bookings/bookingState';
import { useMyBookings } from '@/features/bookings/queries';
import { isOfflineError } from '@/features/sessions/errors';
import type { MyBooking } from '@/features/bookings/types';
import { nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { MyBookingsStackParamList } from '@/app/types';

type Props = NativeStackScreenProps<MyBookingsStackParamList, 'BookingList'>;

type Segment = 'upcoming' | 'past';

const SKELETON_COUNT = 3;

export const MyBookingsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const bookings = useMyBookings();

  const [segment, setSegment] = useState<Segment>('upcoming');

  const options = useMemo(
    () => [
      { value: 'upcoming' as const, label: t('bookings.upcoming') },
      { value: 'past' as const, label: t('bookings.past') },
    ],
    [t],
  );

  const openBooking = useCallback(
    (bookingId: string): void => navigation.navigate('BookingDetail', { bookingId }),
    [navigation],
  );

  const goToSchedule = useCallback(
    (): void => navigation.getParent()?.navigate('ScheduleTab'),
    [navigation],
  );

  const refetch = useCallback((): void => {
    void bookings.refetch();
  }, [bookings]);

  if (bookings.isPending) {
    return (
      <View
        testID="bookings-loading"
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </View>
    );
  }

  if (bookings.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}>
        <ErrorState
          message={
            isOfflineError(bookings.error) ? t('schedule.offlineBanner') : t('bookings.loadError')
          }
          onRetry={refetch}
          isRetrying={bookings.isFetching}
          testID="bookings-error"
        />
      </View>
    );
  }

  const rows: MyBooking[] =
    segment === 'upcoming' ? bookings.segments.upcoming : bookings.segments.past;
  const now = nowInAmman();

  return (
    <ScrollView
      testID="bookings-list"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
      refreshControl={
        <RefreshControl
          refreshing={bookings.isFetching}
          onRefresh={refetch}
          tintColor={theme.colors.textSecondary}
        />
      }
    >
      <SegmentedControl
        label={t('bookings.title')}
        options={options}
        value={segment}
        onChange={setSegment}
        testID="bookings-segments"
      />

      {rows.length === 0 ? (
        segment === 'upcoming' ? (
          <EmptyState
            message={t('bookings.empty')}
            actionLabel={t('bookings.goToSchedule')}
            onAction={goToSchedule}
            testID="bookings-empty"
          />
        ) : (
          <EmptyState message={t('bookings.emptyPast')} testID="bookings-empty-past" />
        )
      ) : (
        rows.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            isPast={segment === 'past'}
            isCancellable={canCancel(booking, now)}
            // 14.9: past rows carry no actions, so they do not open either.
            onPress={segment === 'past' ? undefined : () => openBooking(booking.id)}
            testID={`booking-card-${booking.id}`}
          />
        ))
      )}

      {/* D72, and section 14's opening line: every screen carries the WhatsApp
          action, not only its empty and error states. A player looking at a
          reservation he cannot cancel any more (9.2 rule 3) is exactly the
          person who needs the coach, and `EmptyState` is not on screen for him. */}
      {rows.length === 0 ? null : <WhatsAppButton variant="ghost" testID="bookings-whatsapp" />}
    </ScrollView>
  );
};

export default MyBookingsScreen;
