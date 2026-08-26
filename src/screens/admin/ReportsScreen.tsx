/**
 * Reports. BUILD-SPEC 15.12, reached from the More tab (14.0).
 *
 * Nine sections and a month picker, in the order 15.12 lists them:
 *
 *   1 Revenue          ─┐ ReportsMoneyPanel
 *   3 Profit           ─┘
 *   2 Sessions         ─┐ ReportsSessionsPanel
 *   4 Per session      ─┘
 *   5 Attendance by slot ─┐ ReportsFillPanel
 *   6 Fill rate by venue ─┘
 *   7 Subscriptions    ─┐
 *   8 Outstanding       │ ReportsLedgerPanel
 *   9 Players          ─┘
 *
 * Sections 1 and 3 are adjacent on screen although 15.12 numbers section 2
 * between them, because profit is the revenue total minus the cost total and
 * putting the session counts between the two halves of one subtraction makes
 * both harder to read. All nine are present and each is its own titled card.
 *
 * ── Coach only ───────────────────────────────────────────
 * D73. The screen does not read its own role to decide what to show. It asks
 * the server for the month's totals; every function in migration 0036 raises
 * `not_authorized` for anybody who is not the coach, and that refusal is what
 * renders the permission denied state. An admin therefore sees exactly what
 * 15.12 describes — "a permission denied state, and the API refuses the query
 * as well" — and the same thing happens to a crafted call with no screen
 * involved at all.
 *
 * The other seven sections wait for the first to succeed, so an admin
 * generates one refusal rather than two — and, once he is past the gate, they
 * arrive in the one request `useReportSections` makes rather than seven. See
 * features/reports/queries.ts and migration 0040.
 *
 * ── No export ────────────────────────────────────────────
 * Section 4 item 19 rules out CSV and PDF permanently, so there is no share
 * button, no download, and no long-press to copy a table.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SkeletonCard } from '@/components/primitives';
import { EmptyState, ErrorState, PermissionDenied } from '@/components/states';
import {
  isCoachOnly,
  reportErrorMessageKey,
  useReportSections,
  useReportTotals,
} from '@/features/reports';
import type { PlayerCounts, SubscriptionReport } from '@/features/reports';
import type { Fils } from '@/lib/money';
import { currentAmmanMonthKey } from '@/lib/time';
import { useTheme } from '@/theme';

import { ReportsFillPanel } from './ReportsFillPanel';
import { ReportsLedgerPanel } from './ReportsLedgerPanel';
import { ReportsMoneyPanel } from './ReportsMoneyPanel';
import { ReportsMonthPicker } from './ReportsMonthPicker';
import { ReportsSessionsPanel } from './ReportsSessionsPanel';

const SKELETON_COUNT = 4;

/**
 * What a section shows while its own query is still in flight or has failed on
 * its own. The totals query has already succeeded by then, so the month is
 * readable; one section that could not load must not blank the other eight.
 */
const EMPTY_SUBSCRIPTIONS: SubscriptionReport = {
  soldCount: 0,
  soldValueFils: 0 as Fils,
  creditsUsed: 0,
  creditsExpired: 0,
};

const EMPTY_PLAYER_COUNTS: PlayerCounts = {
  activeThisMonth: 0,
  activePreviousMonth: 0,
  newRegistrations: 0,
};

export const ReportsScreen: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  // The month the coach is standing in, resolved once per mount. A report he
  // opens before midnight and reads after it should not change its idea of
  // "this month" underneath him.
  const currentMonth = useMemo(() => currentAmmanMonthKey(), []);
  const [month, setMonth] = useState(currentMonth);

  const totals = useReportTotals(month, currentMonth);
  const isAllowed = totals.isSuccess;

  const sections = useReportSections(month, isAllowed, currentMonth);

  const retry = useCallback((): void => {
    void totals.refetch();
    void sections.refetch();
  }, [sections, totals]);

  const isRefreshing = totals.isFetching || sections.isFetching;

  const picker = (
    <ReportsMonthPicker month={month} currentMonth={currentMonth} onChange={setMonth} />
  );

  const frame = {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.lg,
  } as const;

  // D73's refusal, and the only place in the app that renders it.
  if (totals.isError && isCoachOnly(totals.error)) {
    return (
      <View testID="reports-denied" style={frame}>
        {picker}
        <PermissionDenied
          title={t('admin.reports.denied.title')}
          message={t('admin.reports.denied.body')}
        />
      </View>
    );
  }

  if (totals.isError) {
    return (
      <View style={{ ...frame, justifyContent: 'center' }}>
        <ErrorState
          message={t(reportErrorMessageKey(totals.error))}
          onRetry={retry}
          isRetrying={totals.isFetching}
          testID="reports-error"
        />
      </View>
    );
  }

  if (totals.isPending) {
    return (
      <View testID="reports-loading" style={{ ...frame, gap: theme.spacing.md }}>
        {picker}
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </View>
    );
  }

  // A month in which nothing ran and nothing was cancelled has nine sections
  // of zeroes to show, which reads as a fault rather than as an answer. The
  // picker is kept so the coach can step out of it in one tap.
  if (totals.data.sessionsRun === 0 && totals.data.sessionsCancelled === 0) {
    return (
      <View style={{ ...frame, gap: theme.spacing.md }}>
        {picker}
        <EmptyState message={t('admin.reports.empty')} testID="reports-empty" />
      </View>
    );
  }

  return (
    <ScrollView
      testID="reports-scroll"
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.xxl,
        gap: theme.spacing.md,
      }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={retry}
          tintColor={theme.colors.accent}
        />
      }
    >
      {picker}

      <ReportsMoneyPanel totals={totals.data} weeks={sections.data?.weeks ?? []} />
      <ReportsSessionsPanel totals={totals.data} sessions={sections.data?.sessions ?? []} />
      <ReportsFillPanel slots={sections.data?.slots ?? []} venues={sections.data?.venues ?? []} />
      <ReportsLedgerPanel
        totals={totals.data}
        subscriptions={sections.data?.subscriptions ?? EMPTY_SUBSCRIPTIONS}
        debtors={sections.data?.outstanding ?? []}
        players={sections.data?.players ?? EMPTY_PLAYER_COUNTS}
      />
    </ScrollView>
  );
};

export default ReportsScreen;
