/**
 * The schedule. BUILD-SPEC 14.6, and the app's home screen.
 *
 * Sessions grouped by day, sticky day headers, ordered by start time.
 *
 * ── Why exactly 5 days ────────────────────────────────────
 * Generation runs 21 days ahead (8.1). RLS stops a player reading past day 5
 * (7.3), and `usePlayerSchedule` asks for the same 5 days so the request is
 * honest about what it wants. Two different numbers, both deliberate.
 *
 * ── Why SectionList and not FlashList ─────────────────────
 * 2.1 asks for FlashList on "any list that can exceed 20 rows". Five days of a
 * twelve-session week is about ten rows and five headers, and SectionList gives
 * the sticky headers 14.6 asks for without a flattening pass. The admin
 * schedule, which really is ninety rows, uses FlashList.
 */
import React, { useCallback } from 'react';
import {
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { SessionCard } from '@/components/domain';
import { DayHeader } from '@/components/domain/DayHeader';
import { SkeletonCard, Text, WhatsAppButton } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { isOfflineError } from '@/features/sessions/errors';
import { usePlayerSchedule } from '@/features/sessions/queries';
import { isPastReservationCutoff } from '@/features/sessions/sessionState';
import type { PlayerSession } from '@/features/sessions/types';
import { nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { ScheduleStackParamList } from '@/app/types';

type Props = NativeStackScreenProps<ScheduleStackParamList, 'ScheduleList'>;

interface Section {
  dayKey: string;
  date: Date;
  data: PlayerSession[];
}

const SKELETON_COUNT = 3;

export const ScheduleScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const schedule = usePlayerSchedule();

  const openSession = useCallback(
    (sessionId: string): void => navigation.navigate('SessionDetail', { sessionId }),
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PlayerSession>): React.ReactElement => (
      <View style={{ paddingBottom: theme.spacing.md }}>
        <SessionCard
          venue={item.venue}
          startsAt={item.startsAt}
          endsAt={item.endsAt}
          sessionType={item.sessionType}
          priceFils={item.payableFils}
          occupancy={item.occupancy}
          status={item.status}
          isBooked={item.isBooked}
          // 5.2: a session that started at 13:00 is shown as closed, not
          // hidden. The cutoff is an hour before the start, so this goes amber
          // before the session itself begins.
          isClosed={isPastReservationCutoff(item.startsAt, nowInAmman())}
          onPress={() => openSession(item.id)}
          testID={`session-card-${item.id}`}
        />
      </View>
    ),
    [openSession, theme.spacing.md],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }): React.ReactElement => (
      <DayHeader
        date={section.date}
        caption={t('schedule.sessionsThatDay', { count: section.data.length })}
        testID={`day-header-${section.dayKey}`}
      />
    ),
    [t],
  );

  if (schedule.isPending) {
    return (
      <View
        testID="schedule-loading"
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        {/* 17.4: no spinners longer than 400ms without a skeleton, and 14.6
            asks specifically for three skeleton cards rather than a spinner. */}
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </View>
    );
  }

  if (schedule.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}>
        <ErrorState
          message={
            isOfflineError(schedule.error) ? t('schedule.offlineBanner') : t('schedule.loadError')
          }
          onRetry={schedule.refetch}
          isRetrying={schedule.isFetching}
          testID="schedule-error"
        />
      </View>
    );
  }

  const sections: Section[] = schedule.days.map((day) => ({
    dayKey: day.dayKey,
    date: day.date,
    data: day.sessions,
  }));

  return (
    <SectionList
      testID="schedule-list"
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.xl,
        flexGrow: 1,
      }}
      refreshControl={
        <RefreshControl
          refreshing={schedule.isFetching}
          onRefresh={schedule.refetch}
          tintColor={theme.colors.accent}
        />
      }
      ListEmptyComponent={
        // D72: the WhatsApp affordance reaches even the empty state.
        <EmptyState message={t('schedule.empty')} testID="schedule-empty" />
      }
      ListFooterComponent={
        sections.length === 0 ? null : (
          <View
            style={{ paddingTop: theme.spacing.md, gap: theme.spacing.md, alignItems: 'center' }}
          >
            <Text variant="caption" tone="tertiary" align="center">
              {t('error.tooFarAhead')}
            </Text>
            {/* D72, and section 14's opening line: the affordance belongs on
                the screen, not only on its empty and error states. This is the
                home screen, and a player who cannot see the session he wants —
                because it is past the 1 hour cutoff, or more than 5 days out —
                is told to ask the coach one line above. */}
            <WhatsAppButton
              variant="ghost"
              style={styles.centeredButton}
              testID="schedule-whatsapp"
            />
          </View>
        )
      }
    />
  );
};

const styles = StyleSheet.create({
  centeredButton: {
    alignSelf: 'center',
  },
});

export default ScheduleScreen;
