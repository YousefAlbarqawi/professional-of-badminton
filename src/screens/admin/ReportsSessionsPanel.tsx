/**
 * BUILD-SPEC 15.12 sections 2 and 4: how many sessions ran, and the sortable
 * table of every one of them.
 *
 * "Sortable" is 15.12's word and the sort happens on the phone: a month is
 * around fifty rows, they are already here, and re-ordering them must not cost
 * a round trip. Tapping the column that is already selected reverses it, which
 * is the behaviour of every table anyone has used.
 *
 * A cancelled session is counted on its own line and appears nowhere else.
 * 12.1 redistributes its share of the night's rent across the sessions that
 * did run, so it has no cost of its own left to show and never had revenue.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ReportSection, ReportSessionRow, ReportStatLine } from '@/components/domain';
import { Chip, Text } from '@/components/primitives';
import { averageAttendance, averageLabel, sortSessions } from '@/features/reports';
import type { ReportSession, ReportTotals, SessionSortKey } from '@/features/reports';
import { formatSessionDate, formatSessionTime } from '@/lib/time';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

export interface ReportsSessionsPanelProps {
  totals: ReportTotals;
  sessions: ReportSession[];
}

const SORT_KEYS: readonly SessionSortKey[] = ['date', 'players', 'revenue', 'cost', 'profit'];

const SORT_LABELS: Record<SessionSortKey, string> = {
  date: 'admin.reports.sessions.sortDate',
  players: 'admin.reports.sessions.sortPlayers',
  revenue: 'admin.reports.sessions.sortRevenue',
  cost: 'admin.reports.sessions.sortCost',
  profit: 'admin.reports.sessions.sortProfit',
};

export const ReportsSessionsPanel: React.FC<ReportsSessionsPanelProps> = ({ totals, sessions }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [sortKey, setSortKey] = useState<SessionSortKey>('date');
  const [isDescending, setIsDescending] = useState(false);

  const changeSort = useCallback((key: SessionSortKey): void => {
    setSortKey((previous) => {
      // Tapping the live column reverses it; moving to another column starts
      // it the way that column is usually read — dates forwards, money with
      // the biggest first.
      if (previous === key) {
        setIsDescending((flag) => !flag);
        return previous;
      }
      setIsDescending(key !== 'date');
      return key;
    });
  }, []);

  const rows = useMemo(
    () => sortSessions(sessions, sortKey, isDescending),
    [isDescending, sessions, sortKey],
  );

  const average = useMemo(
    () => averageAttendance(totals.attendeeCount, totals.sessionsRun),
    [totals.attendeeCount, totals.sessionsRun],
  );

  return (
    <>
      {/* Section 2 */}
      <ReportSection title={t('admin.reports.sessions.title')} testID="report-sessions">
        <ReportStatLine
          label={t('admin.reports.sessions.run')}
          value={String(totals.sessionsRun)}
          isEmphasised
          testID="report-sessions-run"
        />
        <ReportStatLine
          label={t('admin.reports.sessions.cancelled')}
          value={String(totals.sessionsCancelled)}
          testID="report-sessions-cancelled"
        />
        <ReportStatLine
          label={t('admin.reports.sessions.averageOccupancy')}
          value={averageLabel(average)}
          testID="report-sessions-average"
        />
      </ReportSection>

      {/* Section 4 */}
      <ReportSection
        title={t('admin.reports.sessions.perSessionTitle')}
        subtitle={t('admin.reports.sessions.sortLabel')}
        testID="report-session-table"
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.xs,
            marginBottom: theme.spacing.xs,
          }}
        >
          {SORT_KEYS.map((key) => (
            <Pressable
              key={key}
              testID={`report-sort-${key}`}
              onPress={() => changeSort(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: key === sortKey }}
              style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
            >
              <Chip label={t(SORT_LABELS[key])} tone={key === sortKey ? 'accent' : 'neutral'} />
            </Pressable>
          ))}
        </View>

        {rows.length === 0 ? (
          <Text variant="small" tone="secondary">
            {t('admin.reports.sessions.perSessionEmpty')}
          </Text>
        ) : (
          rows.map((row) => (
            <ReportSessionRow
              key={row.sessionId}
              testID={`report-session-${row.sessionId}`}
              when={`${formatSessionDate(row.startsAt, theme.locale)} · ${formatSessionTime(
                row.startsAt,
                theme.locale,
              )}`}
              venue={theme.locale === 'ar' ? row.venueNameAr : row.venueNameEn}
              players={t('admin.reports.sessions.players', {
                players: row.playerCount,
                capacity: row.capacity,
              })}
              revenueFils={row.revenueFils}
              costFils={row.costFils}
              profitFils={row.profitFils}
              revenueLabel={t('admin.reports.sessions.revenueShort')}
              costLabel={t('admin.reports.sessions.costShort')}
              profitLabel={t('admin.reports.sessions.profitShort')}
            />
          ))
        )}
      </ReportSection>
    </>
  );
};

export default ReportsSessionsPanel;
