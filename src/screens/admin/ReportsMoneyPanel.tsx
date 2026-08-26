/**
 * BUILD-SPEC 15.12 sections 1 and 3: Revenue, and Profit.
 *
 * They are one file because they are one arithmetic. Section 1 splits the
 * money that came in three ways; section 3 takes that same total, subtracts
 * what the month cost, and shows the two profit figures 12.3 asks for. Reading
 * them apart would mean reading the revenue total twice.
 *
 * ── The three rules of 12.2, as they appear on screen ────
 * 1. Credits are their own line and carry a note saying what a credit is worth,
 *    because the coach's instinct is that a session is 6 JD and a credit is
 *    not: it is between 4.000 and 5.000, at the rate of the package it came
 *    from. The server values it; this line explains it.
 * 2. Free guests, 0 JD custom rates and coach slots are in none of the three
 *    revenue lines and in every occupancy figure. They cost a slot and pay
 *    nothing, which is exactly what they should look like here.
 * 3. Unpaid money is not in Revenue at all. It appears once, under Profit, as
 *    the difference between "profit" and "profit if all outstanding is
 *    collected".
 *
 * ── The accrued marker ───────────────────────────────────
 * 12.3: "An unpaid assistant coach is shown as an accrued cost with a marker,
 * not as cash spent." The fee is inside the cost total either way, because the
 * academy owes it; the marker and the separate "cash spent" line are how the
 * coach tells the two apart.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ReportSection, ReportStatLine, WeeklyRevenueChart } from '@/components/domain';
import { Text } from '@/components/primitives';
import { maxWeekTotal } from '@/features/reports';
import type { ReportTotals, RevenueWeek } from '@/features/reports';
import { formatMoney } from '@/lib/money';
import { formatWeekLabel } from '@/lib/time';
import { useTheme } from '@/theme';

export interface ReportsMoneyPanelProps {
  totals: ReportTotals;
  weeks: RevenueWeek[];
}

export const ReportsMoneyPanel: React.FC<ReportsMoneyPanelProps> = ({ totals, weeks }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const bars = useMemo(
    () =>
      weeks.map((week) => ({
        label: formatWeekLabel(week.weekStart, theme.locale),
        totalFils: week.totalFils,
      })),
    [theme.locale, weeks],
  );

  const max = useMemo(() => maxWeekTotal(weeks), [weeks]);

  return (
    <>
      {/* Section 1 */}
      <ReportSection title={t('admin.reports.revenue.title')} testID="report-revenue">
        <ReportStatLine
          label={t('admin.reports.revenue.total')}
          value={formatMoney(totals.revenueFils, theme.locale)}
          isEmphasised
          testID="report-revenue-total"
        />
        <ReportStatLine
          label={t('admin.reports.revenue.cash')}
          value={formatMoney(totals.cashFils, theme.locale)}
          testID="report-revenue-cash"
        />
        <ReportStatLine
          label={t('admin.reports.revenue.cliq')}
          value={formatMoney(totals.cliqFils, theme.locale)}
          testID="report-revenue-cliq"
        />
        <ReportStatLine
          label={t('admin.reports.revenue.credit')}
          value={formatMoney(totals.creditFils, theme.locale)}
          note={t('admin.reports.revenue.creditNote')}
          testID="report-revenue-credit"
        />

        <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.sm }}>
          <Text variant="small" weight="600">
            {t('admin.reports.revenue.weekly')}
          </Text>

          {bars.length === 0 ? (
            <Text variant="small" tone="secondary">
              {t('admin.reports.revenue.weeklyEmpty')}
            </Text>
          ) : (
            <WeeklyRevenueChart bars={bars} maxFils={max} testID="report-revenue-weeks" />
          )}
        </View>
      </ReportSection>

      {/* Section 3 */}
      <ReportSection title={t('admin.reports.profit.title')} testID="report-profit">
        <ReportStatLine
          label={t('admin.reports.profit.profit')}
          value={formatMoney(totals.profitFils, theme.locale)}
          tone={totals.profitFils < 0 ? 'danger' : 'primary'}
          isEmphasised
          testID="report-profit-total"
        />
        <ReportStatLine
          label={t('admin.reports.profit.ifCollected')}
          value={formatMoney(totals.profitIfCollectedFils, theme.locale)}
          note={`${t('admin.reports.profit.outstanding')}: ${formatMoney(
            totals.outstandingFils,
            theme.locale,
          )}`}
          testID="report-profit-if-collected"
        />

        <View style={{ height: theme.spacing.xs }} />

        <ReportStatLine
          label={t('admin.reports.profit.revenue')}
          value={formatMoney(totals.revenueFils, theme.locale)}
        />
        <ReportStatLine
          label={t('admin.reports.profit.cost')}
          value={formatMoney(totals.costFils, theme.locale)}
          testID="report-cost-total"
        />
        <ReportStatLine
          label={t('admin.reports.profit.court')}
          value={formatMoney(totals.courtCostFils, theme.locale)}
        />
        <ReportStatLine
          label={t('admin.reports.profit.water')}
          value={formatMoney(totals.waterCostFils, theme.locale)}
        />
        <ReportStatLine
          label={t('admin.reports.profit.coach')}
          value={formatMoney(totals.coachFeeFils, theme.locale)}
          note={
            totals.coachFeeAccruedFils > 0
              ? t('admin.reports.profit.accrued', {
                  amount: formatMoney(totals.coachFeeAccruedFils, theme.locale),
                })
              : undefined
          }
          testID="report-cost-coach"
        />
        {totals.coachFeeAccruedFils > 0 ? (
          <ReportStatLine
            label={t('admin.reports.profit.cashSpent')}
            value={formatMoney(totals.cashCostFils, theme.locale)}
            tone="secondary"
            testID="report-cost-cash-spent"
          />
        ) : null}
      </ReportSection>
    </>
  );
};

export default ReportsMoneyPanel;
