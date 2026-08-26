/**
 * BUILD-SPEC 15.12 sections 7, 8 and 9: subscriptions, outstanding money, and
 * players.
 *
 * ── Section 7 ────────────────────────────────────────────
 * "Sold this month" is granted this month: D49 and D50 keep subscription money
 * outside the app entirely, so the grant is the only date it knows. Its value
 * is what was granted at the rate snapshotted onto it (11.1), which is also
 * the rate every credit spent from it is worth (12.2 rule 1).
 *
 * ── Section 8 ────────────────────────────────────────────
 * Two different numbers, deliberately. "Total owed to date" is the coach's
 * book as it stands — a debt from March is still money he is owed in May, and
 * it is what he chases. "Unpaid from this month" is the figure that turns this
 * month's profit into 12.3's second profit figure. The ten names are ordered
 * by the book, with the part of each that this month created underneath.
 *
 * D40's line is repeated here because it is the thing most likely to be
 * misread: a balance is a record, never a gate.
 *
 * ── Section 9 ────────────────────────────────────────────
 * Active means he was on a court, so a player who booked and cancelled is not
 * one. Guests have no account and are counted as attendees everywhere else,
 * not here.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ReportSection, ReportStatLine } from '@/components/domain';
import { Text } from '@/components/primitives';
import { activeChange, signedLabel } from '@/features/reports';
import type { Debtor, PlayerCounts, ReportTotals, SubscriptionReport } from '@/features/reports';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

export interface ReportsLedgerPanelProps {
  totals: ReportTotals;
  subscriptions: SubscriptionReport;
  debtors: Debtor[];
  players: PlayerCounts;
}

export const ReportsLedgerPanel: React.FC<ReportsLedgerPanelProps> = ({
  totals,
  subscriptions,
  debtors,
  players,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const change = useMemo(
    () => activeChange(players.activeThisMonth, players.activePreviousMonth),
    [players.activeThisMonth, players.activePreviousMonth],
  );

  return (
    <>
      {/* Section 7 */}
      <ReportSection title={t('admin.reports.subs.title')} testID="report-subscriptions">
        <ReportStatLine
          label={t('admin.reports.subs.sold')}
          value={String(subscriptions.soldCount)}
          testID="report-subs-sold"
        />
        <ReportStatLine
          label={t('admin.reports.subs.soldValue')}
          value={formatMoney(subscriptions.soldValueFils, theme.locale)}
        />
        <ReportStatLine
          label={t('admin.reports.subs.creditsUsed')}
          value={String(subscriptions.creditsUsed)}
          testID="report-subs-used"
        />
        <ReportStatLine
          label={t('admin.reports.subs.creditsExpired')}
          value={String(subscriptions.creditsExpired)}
          testID="report-subs-expired"
        />
      </ReportSection>

      {/* Section 8 */}
      <ReportSection
        title={t('admin.reports.outstanding.title')}
        subtitle={t('admin.reports.outstanding.note')}
        testID="report-outstanding"
      >
        <ReportStatLine
          label={t('admin.reports.outstanding.totalOwed')}
          value={formatMoney(totals.owedToDateFils, theme.locale)}
          isEmphasised
          testID="report-owed-total"
        />
        <ReportStatLine
          label={t('admin.reports.outstanding.monthOutstanding')}
          value={formatMoney(totals.outstandingFils, theme.locale)}
          testID="report-owed-month"
        />

        <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
          <Text variant="small" weight="600">
            {t('admin.reports.outstanding.topDebtors')}
          </Text>

          {debtors.length === 0 ? (
            <Text variant="small" tone="secondary">
              {t('admin.reports.outstanding.empty')}
            </Text>
          ) : (
            debtors.map((debtor) => (
              <ReportStatLine
                key={debtor.playerId}
                testID={`report-debtor-${debtor.playerId}`}
                label={debtor.displayName}
                value={formatMoney(debtor.owedFils, theme.locale)}
                note={
                  debtor.monthOwedFils > 0
                    ? t('admin.reports.outstanding.monthPart', {
                        amount: formatMoney(debtor.monthOwedFils, theme.locale),
                      })
                    : undefined
                }
              />
            ))
          )}
        </View>
      </ReportSection>

      {/* Section 9 */}
      <ReportSection title={t('admin.reports.players.title')} testID="report-players">
        <ReportStatLine
          label={t('admin.reports.players.active')}
          value={String(players.activeThisMonth)}
          isEmphasised
          testID="report-players-active"
        />
        <ReportStatLine
          label={t('admin.reports.players.previous')}
          value={String(players.activePreviousMonth)}
        />
        <ReportStatLine
          label={t('admin.reports.players.change')}
          value={signedLabel(change)}
          tone={change < 0 ? 'danger' : 'primary'}
          testID="report-players-change"
        />
        <ReportStatLine
          label={t('admin.reports.players.newRegistrations')}
          value={String(players.newRegistrations)}
          testID="report-players-new"
        />
      </ReportSection>
    </>
  );
};

export default ReportsLedgerPanel;
