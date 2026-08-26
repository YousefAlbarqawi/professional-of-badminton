/**
 * "Move to another session". BUILD-SPEC 15.2, closed in phase 10 —
 * OPEN-ITEMS.md records the three questions this RPC answers.
 *
 * A two step sheet, the same shape as `AddPlayerSheet`: pick a session, then
 * confirm. The list is `useAdminSchedule`'s own 30 day window (15.3) filtered
 * to what a move could actually land on — not the session he is already on,
 * not locked, not cancelled. A full one stays in the list rather than
 * disappearing, greyed out with a reason, the same choice 15.2's player
 * search makes for an already-booked result: the coach picked it and needs to
 * know why it refused him, not wonder where it went.
 *
 * Nothing here touches price. `admin_move_booking` carries `expected_fils` and
 * `paid_fils` across unchanged, so there is nothing about payment for this
 * sheet to ask.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SessionCard } from '@/components/domain';
import { Button, Chip, Sheet, SkeletonCard, Text } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { bookingErrorMessageKey } from '@/features/bookings/errors';
import { useMoveBooking } from '@/features/bookings/mutations';
import type { RosterEntry } from '@/features/bookings/types';
import { useAdminSchedule } from '@/features/sessions/queries';
import type { Session } from '@/features/sessions/types';
import { formatSessionDate, formatSessionTimeRange } from '@/lib/time';
import { useTheme } from '@/theme';

export interface MoveBookingSheetProps {
  entry: RosterEntry | null;
  sourceSession: Session;
  onClose: () => void;
}

export const MoveBookingSheet: React.FC<MoveBookingSheetProps> = ({
  entry,
  sourceSession,
  onClose,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const schedule = useAdminSchedule();
  const moveBooking = useMoveBooking();

  const [selected, setSelected] = useState<Session | null>(null);

  const candidates = useMemo(
    () =>
      (schedule.data ?? []).filter(
        (session) =>
          session.id !== sourceSession.id &&
          session.status !== 'locked' &&
          session.status !== 'cancelled',
      ),
    [schedule.data, sourceSession.id],
  );

  const close = useCallback((): void => {
    setSelected(null);
    moveBooking.reset();
    onClose();
  }, [moveBooking, onClose]);

  const back = useCallback((): void => {
    setSelected(null);
    moveBooking.reset();
  }, [moveBooking]);

  const confirm = useCallback((): void => {
    if (entry === null || selected === null) return;
    moveBooking.mutate(
      { bookingId: entry.bookingId, targetSessionId: selected.id },
      { onSuccess: close },
    );
  }, [close, entry, moveBooking, selected]);

  const name = entry?.displayName ?? '';

  return (
    <Sheet
      isVisible={entry !== null}
      title={
        selected === null
          ? t('admin.manage.moveTitle', { name })
          : t('admin.manage.moveConfirmTitle', { name })
      }
      onClose={close}
      isDismissDisabled={moveBooking.isPending}
      testID="move-booking-sheet"
    >
      {selected === null ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="body" tone="secondary">
            {t('admin.manage.moveSubtitle')}
          </Text>

          {schedule.isPending ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : schedule.isError ? (
            <ErrorState
              message={t('admin.manage.moveLoadError')}
              onRetry={schedule.refetch}
              isRetrying={schedule.isFetching}
              showWhatsApp={false}
            />
          ) : candidates.length === 0 ? (
            <EmptyState message={t('admin.manage.moveEmpty')} showWhatsApp={false} />
          ) : (
            candidates.map((session) => (
              <SessionCard
                key={session.id}
                venue={session.venue}
                startsAt={session.startsAt}
                endsAt={session.endsAt}
                sessionType={session.sessionType}
                priceFils={session.priceFils}
                occupancy={session.occupancy}
                status={session.status}
                isClosed={session.occupancy.remaining <= 0}
                onPress={session.occupancy.remaining <= 0 ? undefined : () => setSelected(session)}
                trailing={
                  session.occupancy.remaining <= 0 ? (
                    <Chip
                      label={t('admin.manage.moveFull')}
                      tone="danger"
                      testID={`move-target-full-${session.id}`}
                    />
                  ) : undefined
                }
                testID={`move-target-${session.id}`}
              />
            ))
          )}
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="body" testID="move-confirm-body">
            {t('admin.manage.moveConfirmBody', {
              name,
              fromVenue: sourceSession.venue.name,
              toVenue: selected.venue.name,
              date: `${formatSessionDate(selected.startsAt, theme.locale)}, ${formatSessionTimeRange(selected.startsAt, selected.endsAt, theme.locale)}`,
            })}
          </Text>

          {moveBooking.isError ? (
            <Chip
              label={t(bookingErrorMessageKey(moveBooking.error))}
              tone="danger"
              testID="move-error"
            />
          ) : null}

          <Button
            label={t('admin.manage.moveConfirm')}
            onPress={confirm}
            isLoading={moveBooking.isPending}
            isFullWidth
            testID="move-confirm"
          />
          <Button
            label={t('common.back')}
            onPress={back}
            variant="ghost"
            isFullWidth
            isDisabled={moveBooking.isPending}
            testID="move-back"
          />
        </View>
      )}
    </Sheet>
  );
};

export default MoveBookingSheet;
