/**
 * Admin schedule. BUILD-SPEC 15.3.
 *
 * "A calendar-ish list, 30 days forward, grouped by day, including cancelled
 * sessions in a struck-through style. Row actions: Edit this date, Cancel this
 * session, Duplicate. Header: Create a one-off session."
 *
 * ── Why FlashList here and SectionList on the player schedule ──
 * 2.1 asks for FlashList on any list that can exceed 20 rows. Thirty days of a
 * twelve-session week is roughly fifty cards plus thirty headers. The player's
 * five days is about fifteen rows and stays on SectionList, which gives sticky
 * headers for free.
 *
 * FlashList takes one flat array, so the day headers and the session cards are
 * interleaved into a single list of tagged rows.
 *
 * *Duplicate* is a one-off session with the fields prefilled, and 15.6 is the
 * screen that creates one, so it lands as a prefill on that screen rather than
 * as a fourth code path here: a ghost button per row calls `navigate` with
 * venue, start time, duration, price and court count carried over and the date
 * left blank, which `CreateSessionScreen` then defaults to today rather than
 * leaving invalid — a duplicate almost never wants the same calendar day.
 */
import React, { useCallback, useMemo } from 'react';
import { RefreshControl, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { formatInTimeZone } from 'date-fns-tz';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { DayHeader, SessionCard } from '@/components/domain';
import { Button, Chip, SkeletonCard, Text } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { isOfflineError } from '@/features/sessions/errors';
import { ADMIN_SCHEDULE_DAYS, useAdminSchedule } from '@/features/sessions/queries';
import { groupByAmmanDay } from '@/features/sessions/sessionState';
import type { Session } from '@/features/sessions/types';
import { toJD } from '@/lib/money';
import { TZ } from '@/lib/time';
import { useTheme } from '@/theme';
import type { AdminScheduleStackParamList } from '@/app/types';

import { statusLabelKey, statusTone } from './sessionStatus';

type Props = NativeStackScreenProps<AdminScheduleStackParamList, 'AdminScheduleList'>;

type Row =
  | { kind: 'header'; key: string; date: Date; count: number }
  | { kind: 'session'; key: string; session: Session };

/** Rounds to the nearer of D5's two durations, same rule `SessionEditScreen` uses. */
function durationMinutesOf(session: Session): 90 | 150 {
  const minutes = Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / (60 * 1000));
  return minutes === 150 ? 150 : 90;
}

function toRows(days: readonly { dayKey: string; date: Date; sessions: Session[] }[]): Row[] {
  return days.flatMap<Row>((day) => [
    { kind: 'header', key: `header-${day.dayKey}`, date: day.date, count: day.sessions.length },
    ...day.sessions.map<Row>((session) => ({
      kind: 'session',
      key: session.id,
      session,
    })),
  ]);
}

export const AdminScheduleScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const schedule = useAdminSchedule();

  const rows = useMemo(() => toRows(groupByAmmanDay(schedule.data ?? [])), [schedule.data]);

  const openEdit = useCallback(
    (sessionId: string): void => navigation.navigate('SessionEdit', { sessionId }),
    [navigation],
  );

  const openCreate = useCallback(
    (): void => navigation.navigate('CreateSession', {}),
    [navigation],
  );

  const openDuplicate = useCallback(
    (session: Session): void => {
      // sessionDate is left out on purpose: a duplicate almost never wants the
      // same calendar day, and CreateSessionScreen defaults an absent date to
      // today rather than leaving the field blank and invalid.
      navigation.navigate('CreateSession', {
        venueId: session.venue.id,
        startTime: formatInTimeZone(session.startsAt, TZ, 'HH:mm'),
        durationMinutes: durationMinutesOf(session),
        priceJD: String(toJD(session.priceFils)),
        courtCount: session.courtCount,
      });
    },
    [navigation],
  );

  const refetch = useCallback((): void => {
    void schedule.refetch();
  }, [schedule]);

  const renderItem = useCallback(
    ({ item }: { item: Row }): React.ReactElement => {
      if (item.kind === 'header') {
        return (
          <DayHeader
            date={item.date}
            caption={t('schedule.sessionsThatDay', { count: item.count })}
            testID={`admin-day-${item.key}`}
          />
        );
      }

      const { session } = item;

      return (
        <View style={{ paddingBottom: theme.spacing.sm }}>
          <SessionCard
            venue={session.venue}
            startsAt={session.startsAt}
            endsAt={session.endsAt}
            sessionType={session.sessionType}
            priceFils={session.priceFils}
            occupancy={session.occupancy}
            status={session.status}
            // 15.3: cancelled sessions stay on the list, struck through.
            onPress={() => openEdit(session.id)}
            trailing={
              <Chip
                label={t(statusLabelKey(session.status))}
                tone={statusTone(session.status)}
                testID={`admin-status-${session.id}`}
              />
            }
            testID={`admin-card-${session.id}`}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Button
              label={t('admin.schedule.duplicate')}
              onPress={() => openDuplicate(session)}
              variant="ghost"
              testID={`admin-duplicate-${session.id}`}
            />
          </View>
        </View>
      );
    },
    [openDuplicate, openEdit, t, theme.spacing.sm],
  );

  if (schedule.isPending) {
    return (
      <View
        testID="admin-schedule-loading"
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (schedule.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}>
        <ErrorState
          message={
            isOfflineError(schedule.error)
              ? t('schedule.offlineBanner')
              : t('admin.schedule.loadError')
          }
          onRetry={refetch}
          isRetrying={schedule.isFetching}
          testID="admin-schedule-error"
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        <Text variant="caption" tone="tertiary">
          {t('admin.schedule.subtitle', { count: ADMIN_SCHEDULE_DAYS })}
        </Text>
        <Button
          label={t('admin.schedule.createOneOff')}
          onPress={openCreate}
          isFullWidth
          testID="admin-create-one-off"
        />
      </View>

      {rows.length === 0 ? (
        <EmptyState message={t('admin.schedule.empty')} testID="admin-schedule-empty" />
      ) : (
        <FlashList
          testID="admin-schedule-list"
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.xl,
          }}
          refreshControl={
            <RefreshControl
              refreshing={schedule.isFetching}
              onRefresh={refetch}
              tintColor={theme.colors.accent}
            />
          }
        />
      )}
    </View>
  );
};

export default AdminScheduleScreen;
