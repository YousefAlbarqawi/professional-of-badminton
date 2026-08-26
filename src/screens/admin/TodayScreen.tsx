/**
 * Today. BUILD-SPEC 15.1, and the default landing screen for staff.
 *
 * "Lists today's sessions, then tomorrow's. Each card: venue, time, occupancy,
 * status chip, and a payment summary once the session is past."
 *
 * The primary tap goes to Session manage (15.2). The *Court board* button is
 * 15.1's secondary action, and it appears within two hours of the start and
 * lands straight on 13.10's board rather than on the roster.
 *
 * The payment summary — collected and outstanding, once a session is past —
 * closed in phase 10 with `get_sessions_money_summary` (migration 0039): one
 * query for the whole list rather than one per card, the shape recorded in
 * OPEN-ITEMS.md as worth waiting for. It is decoration on a list that is
 * useful without it, the same way the player schedule treats the booked chip
 * (features/sessions/queries.ts), so a card renders with or without it rather
 * than the screen waiting on a second query to finish.
 */
import React, { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { DayHeader, SessionCard } from '@/components/domain';
import { Button, Chip, SkeletonCard, Text } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { useSessionsMoneySummary } from '@/features/payments/queries';
import type { SessionMoneyGlance } from '@/features/payments/types';
import { isOfflineError } from '@/features/sessions/errors';
import { useTodaySessions } from '@/features/sessions/queries';
import { groupByAmmanDay } from '@/features/sessions/sessionState';
import { formatMoney } from '@/lib/money';
import { nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { TodayStackParamList } from '@/app/types';

import { isSessionPast, showsCourtBoard, statusLabelKey, statusTone } from './sessionStatus';

type Props = NativeStackScreenProps<TodayStackParamList, 'TodayList'>;

export const TodayScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const sessions = useTodaySessions();

  // 5.1: the sanctioned clock, never the device's idea of the date.
  const now = nowInAmman();

  const days = useMemo(() => groupByAmmanDay(sessions.data ?? []), [sessions.data]);

  // 15.1's payment summary: "once the session is past." One query for every
  // qualifying card on the list rather than one per card.
  const pastSessionIds = useMemo(
    () => (sessions.data ?? []).filter((session) => isSessionPast(session, now)).map((s) => s.id),
    [sessions.data, now],
  );
  const moneySummary = useSessionsMoneySummary(pastSessionIds, !sessions.isPending);

  const openSession = useCallback(
    (sessionId: string): void => navigation.navigate('SessionManage', { sessionId }),
    [navigation],
  );

  // 15.1's secondary action. D68 keeps the board itself to staff, and this
  // stack is only reachable by staff to begin with.
  const openCourtBoard = useCallback(
    (sessionId: string): void =>
      navigation.navigate('SessionManage', { sessionId, tab: 'courtBoard' }),
    [navigation],
  );

  const refetch = useCallback((): void => {
    void sessions.refetch();
    void moneySummary.refetch();
  }, [moneySummary, sessions]);

  if (sessions.isPending) {
    return (
      <View
        testID="today-loading"
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

  if (sessions.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}>
        <ErrorState
          message={
            isOfflineError(sessions.error)
              ? t('schedule.offlineBanner')
              : t('admin.today.loadError')
          }
          onRetry={refetch}
          isRetrying={sessions.isFetching}
          testID="today-error"
        />
      </View>
    );
  }

  return (
    <ScrollView
      testID="today-list"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.xl,
        flexGrow: 1,
      }}
      refreshControl={
        <RefreshControl
          refreshing={sessions.isFetching}
          onRefresh={refetch}
          tintColor={theme.colors.accent}
        />
      }
    >
      {days.length === 0 ? (
        <EmptyState message={t('admin.today.empty')} testID="today-empty" />
      ) : (
        days.map((day, index) => (
          <View key={day.dayKey}>
            <DayHeader
              date={day.date}
              caption={t(index === 0 ? 'admin.today.todayHeading' : 'admin.today.tomorrowHeading')}
              testID={`today-header-${day.dayKey}`}
            />
            {day.sessions.map((session) => (
              <View key={session.id} style={{ paddingBottom: theme.spacing.sm }}>
                <SessionCard
                  venue={session.venue}
                  startsAt={session.startsAt}
                  endsAt={session.endsAt}
                  sessionType={session.sessionType}
                  priceFils={session.priceFils}
                  occupancy={session.occupancy}
                  status={session.status}
                  onPress={() => openSession(session.id)}
                  trailing={
                    <Chip
                      label={t(statusLabelKey(session.status))}
                      tone={statusTone(session.status)}
                      testID={`today-status-${session.id}`}
                    />
                  }
                  testID={`today-card-${session.id}`}
                />
                {isSessionPast(session, now) ? (
                  <SessionMoneyGlanceRow
                    glance={moneySummary.data?.get(session.id)}
                    testID={`today-money-${session.id}`}
                  />
                ) : null}
                {showsCourtBoard(session, now) ? (
                  <View style={{ paddingTop: theme.spacing.sm }}>
                    <Button
                      label={t('admin.today.courtBoard')}
                      variant="secondary"
                      onPress={() => openCourtBoard(session.id)}
                      testID={`today-court-board-${session.id}`}
                    />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
};

interface SessionMoneyGlanceRowProps {
  /** Undefined while the batch is still loading or refused — decoration,
      not a blocker, so the row is simply absent rather than showing a
      loading or error state of its own. */
  glance: SessionMoneyGlance | undefined;
  testID: string;
}

/** 15.1's card footer: collected and outstanding, once a session is past. */
const SessionMoneyGlanceRow: React.FC<SessionMoneyGlanceRowProps> = ({ glance, testID }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  if (glance === undefined) return null;

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        paddingTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      <Text variant="caption" tone="secondary" testID={`${testID}-collected`}>
        {`${t('admin.money.collectedTotal')}: ${formatMoney(glance.collectedFils, theme.locale)}`}
      </Text>
      <Text
        variant="caption"
        tone={glance.outstandingFils > 0 ? 'warning' : 'secondary'}
        testID={`${testID}-outstanding`}
      >
        {`${t('admin.money.outstandingTotal')}: ${formatMoney(glance.outstandingFils, theme.locale)}`}
      </Text>
    </View>
  );
};

export default TodayScreen;
