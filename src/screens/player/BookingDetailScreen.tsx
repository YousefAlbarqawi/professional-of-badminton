/**
 * Booking detail. BUILD-SPEC 14.10.
 *
 * "Everything about one booking: session summary, payment method, and for
 * CliQ, the uploaded screenshot thumbnail. Cancel button subject to the
 * window. WhatsApp button."
 *
 * ── What is deliberately not here ─────────────────────────
 * "The player is never shown `payment_status`, whether the coach marked him
 * paid, or any balance." A4. The query does not fetch any of it, so there is
 * nothing on this screen to leak.
 *
 * ── The cancel button ─────────────────────────────────────
 * D23 and D24 again, and the same two states as 14.7: outside three hours he
 * gets the button and a confirmation; inside it the button is replaced by a
 * sentence and a way to reach the coach. 9.2 gives that sentence in as many
 * words.
 *
 * The CliQ thumbnail is phase 5, along with the upload that would produce one.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PaymentMethodChip } from '@/components/domain';
import { Button, Card, Dialog, SkeletonCard, Text, WhatsAppButton } from '@/components/primitives';
import { ErrorState } from '@/components/states';
import { canCancel, isCancellationTooLate } from '@/features/bookings/bookingState';
import { bookingErrorMessageKey } from '@/features/bookings/errors';
import { useCancelBooking } from '@/features/bookings/mutations';
import { useMyBooking } from '@/features/bookings/queries';
import type { MyBooking } from '@/features/bookings/types';
import { formatMoney } from '@/lib/money';
import {
  formatSessionDate,
  formatSessionTime,
  formatSessionTimeRange,
  nowInAmman,
} from '@/lib/time';
import { useTheme } from '@/theme';
import type { MyBookingsStackParamList } from '@/app/types';

type Props = NativeStackScreenProps<MyBookingsStackParamList, 'BookingDetail'>;

interface FactRowProps {
  label: string;
  value: string;
  testID?: string;
}

const FactRow: React.FC<FactRowProps> = ({ label, value, testID }) => (
  <View style={{ gap: 2 }} testID={testID}>
    <Text variant="caption" tone="tertiary">
      {label}
    </Text>
    <Text variant="body">{value}</Text>
  </View>
);

export const BookingDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { bookingId } = route.params;
  const { t } = useTranslation();
  const theme = useTheme();
  const booking = useMyBooking(bookingId);

  const retry = useCallback((): void => {
    void booking.refetch();
  }, [booking]);

  if (booking.isPending) {
    return (
      <View
        testID="booking-detail-loading"
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (booking.isError || booking.data === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}>
        <ErrorState
          message={t('bookings.loadError')}
          onRetry={retry}
          isRetrying={booking.isFetching}
          testID="booking-detail-error"
        />
      </View>
    );
  }

  return <BookingDetailContent booking={booking.data} onCancelled={navigation.goBack} />;
};

interface ContentProps {
  booking: MyBooking;
  onCancelled: () => void;
}

const BookingDetailContent: React.FC<ContentProps> = ({ booking, onCancelled }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const cancelBooking = useCancelBooking();

  const [isConfirming, setIsConfirming] = useState(false);

  const now = nowInAmman();
  const { session } = booking;
  const isCancellable = canCancel(booking, now);
  const isTooLate = isCancellationTooLate(booking, now);

  const ask = useCallback((): void => setIsConfirming(true), []);
  const dismiss = useCallback((): void => setIsConfirming(false), []);

  const confirm = useCallback((): void => {
    cancelBooking.mutate(booking.id, {
      onSuccess: () => {
        setIsConfirming(false);
        // 14.9 is where he came from and the row is gone from it now.
        onCancelled();
      },
    });
  }, [booking.id, cancelBooking, onCancelled]);

  return (
    <ScrollView
      testID="booking-detail"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
    >
      <Card testID="booking-detail-summary">
        <Text variant="title">{session.venue.name}</Text>
        <Text variant="body" tone="secondary">
          {session.venue.area}
        </Text>

        <View style={{ gap: theme.spacing.sm, paddingTop: theme.spacing.sm }}>
          <FactRow
            label={t('session.when')}
            value={`${formatSessionDate(session.startsAt, theme.locale)} · ${formatSessionTimeRange(
              session.startsAt,
              session.endsAt,
              theme.locale,
            )}`}
            testID="booking-when"
          />
          <FactRow
            label={t('session.duration')}
            value={t(session.sessionType === 'extended' ? 'session.extended' : 'session.standard')}
          />
          <FactRow
            label={t('payment.amount')}
            // A7: the price he booked at, not today's price.
            value={formatMoney(booking.expectedFils, theme.locale)}
            testID="booking-amount"
          />
        </View>

        <View style={{ paddingTop: theme.spacing.sm, gap: theme.spacing.xs }}>
          <Text variant="caption" tone="tertiary">
            {t('bookings.method')}
          </Text>
          <PaymentMethodChip method={booking.paymentMethod} testID="booking-detail-method" />
        </View>

        <Text variant="caption" tone="tertiary" style={{ paddingTop: theme.spacing.sm }}>
          {t('bookings.bookedOn', { date: formatSessionDate(booking.bookedAt, theme.locale) })}
        </Text>
      </Card>

      {/* 14.10 asks for "the uploaded screenshot thumbnail" here. He cannot
          have it: 7.3 gives only staff SELECT on the payment-proofs bucket, so
          the player who uploaded the image cannot read it back. He already has
          it in his own gallery, and the copy in storage exists for the coach's
          review screen (10.2). Recorded as conflict C5. */}
      {booking.paymentMethod === 'cliq' ? (
        <Card testID="booking-proof">
          <Text variant="small" tone="secondary">
            {t('bookings.proofAttached')}
          </Text>
        </Card>
      ) : null}

      {session.status === 'cancelled' ? (
        <Card style={{ borderColor: theme.colors.danger }} testID="booking-session-cancelled">
          <Text variant="heading" tone="danger">
            {t('bookings.cancelledSession')}
          </Text>
          {session.cancellationNote === null || session.cancellationNote.trim() === '' ? null : (
            <Text variant="small" tone="secondary">
              {t('session.cancelledNote', { note: session.cancellationNote })}
            </Text>
          )}
        </Card>
      ) : null}

      {isCancellable ? (
        <Button
          label={t('session.cancelReservation')}
          onPress={ask}
          variant="secondary"
          isFullWidth
          testID="booking-cancel"
        />
      ) : isTooLate ? (
        <View style={{ gap: theme.spacing.sm }} testID="booking-cancel-too-late">
          {/* 9.2: the cancel button is replaced by a WhatsApp button and this
              copy. D24. */}
          <Text variant="small" tone="secondary">
            {t('session.cancelWindowClosed')}
          </Text>
        </View>
      ) : (
        <Text variant="small" tone="secondary" testID="booking-past-note">
          {t('bookings.pastNote')}
        </Text>
      )}

      <WhatsAppButton isFullWidth />

      <Dialog
        isVisible={isConfirming}
        title={t('session.cancelTitle')}
        message={t('session.cancelBody', {
          venue: session.venue.name,
          time: formatSessionTime(session.startsAt, theme.locale),
        })}
        confirmLabel={t('session.cancelConfirm')}
        cancelLabel={t('session.cancelKeep')}
        onConfirm={confirm}
        onCancel={dismiss}
        isConfirming={cancelBooking.isPending}
        isDestructive
        testID="booking-cancel-dialog"
      >
        {cancelBooking.isError ? (
          <Text variant="small" tone="danger" testID="booking-cancel-error">
            {t(bookingErrorMessageKey(cancelBooking.error))}
          </Text>
        ) : null}
      </Dialog>
    </ScrollView>
  );
};

export default BookingDetailScreen;
