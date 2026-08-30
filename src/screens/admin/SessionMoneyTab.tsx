/**
 * The review interface. BUILD-SPEC 10.2, reached from 15.2's Money tab.
 *
 * "Reachable from a session that is pending_review or confirmed, until it
 * locks."
 *
 * ── The 7 day rule ────────────────────────────────────────
 * Everything on this screen follows one boolean, `gate.canEdit`, computed in
 * features/payments/reviewState.ts from the session's status *and* the clock.
 * Both, because the nightly job that writes `locked` runs at 03:10 (8.6): for
 * the hours between the deadline passing and the job firing, a session is over
 * its window and still says `pending_review`. The server refuses a mutation in
 * those hours (`assert_session_unlocked`), so the screen must not offer one.
 *
 * When it is closed, "every control becomes read only, with a note explaining
 * why. There is no unlock."
 *
 * ── The footer ────────────────────────────────────────────
 * "Footer summary, always visible: expected total, collected total,
 * outstanding total, and the session's cost and profit." Always visible means
 * pinned below the list rather than at the end of the scroll, because the
 * coach is reconciling against it while he works down the rows.
 *
 * The three money totals come from the rows on screen so they move the instant
 * a row is marked paid; the cost and the value of a credit come from the
 * server, which is the only place that knows the cost snapshot (12.1) and the
 * subscription's per-visit rate (12.2 rule 1). `mergeSummary` joins them.
 *
 * ── The cost card ─────────────────────────────────────────
 * The footer's cost line is one number, and 12.1's arithmetic produced it from
 * three rate tables. `SessionCostsCard` below it is where that number is
 * broken into its parts and, where the night did not match the rate, corrected
 * — a coach paid more than the standard fee, no water brought, snacks bought,
 * or the hall charged for running late. Migration 0043 and the note at the top
 * of that file. It follows the same `gate.canEdit` as every row above it.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PaymentRow } from '@/components/domain';
import { Button, Card, Chip, SkeletonCard, Text } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import type { RosterEntry } from '@/features/bookings/types';
import { paymentErrorMessageKey } from '@/features/payments/errors';
import { useConfirmReview, useRecordPayment, useReopenReview } from '@/features/payments/mutations';
import { useMoneySummary, useSessionReview } from '@/features/payments/queries';
import { mergeSummary, reviewGate } from '@/features/payments/reviewState';
import type { ReviewRow } from '@/features/payments/types';
import { formatMoney, type Fils } from '@/lib/money';
import { nowInAmman } from '@/lib/time';
import type { Session } from '@/features/sessions/types';
import { useTheme } from '@/theme';

import { ChangeMethodSheet } from './ChangeMethodSheet';
import { SessionCostsCard } from './SessionCostsCard';
import { ConfirmReviewDialog } from './ConfirmReviewDialog';
import { PartialPaymentSheet } from './PartialPaymentSheet';
import { ProofViewer } from './ProofViewer';

export interface SessionMoneyTabProps {
  session: Session;
  /** 10.2's *Remove from session*, which reuses 15.2's dialog and its credit prompt. */
  onRemove: (entry: RosterEntry) => void;
  /** 15.8 section 6, reached by tapping a name. */
  onOpenPlayer: (playerId: string) => void;
}

interface TotalLineProps {
  label: string;
  amount: Fils;
  tone?: 'primary' | 'secondary' | 'warning' | 'accent';
  testID?: string;
}

const TotalLine: React.FC<TotalLineProps> = ({ label, amount, tone = 'primary', testID }) => {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
      <Text variant="small" tone="secondary">
        {label}
      </Text>
      <Text variant="small" weight="600" tone={tone} testID={testID}>
        {formatMoney(amount, theme.locale)}
      </Text>
    </View>
  );
};

export const SessionMoneyTab: React.FC<SessionMoneyTabProps> = ({
  session,
  onRemove,
  onOpenPlayer,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const review = useSessionReview(session.id);
  const summary = useMoneySummary(session.id);
  const recordPayment = useRecordPayment();
  const confirmReview = useConfirmReview();
  const reopenReview = useReopenReview();

  const [partialRow, setPartialRow] = useState<ReviewRow | null>(null);
  const [methodRow, setMethodRow] = useState<ReviewRow | null>(null);
  const [proofRow, setProofRow] = useState<ReviewRow | null>(null);
  const [dialog, setDialog] = useState<'confirm' | 'reopen' | null>(null);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  const gate = useMemo(
    () => reviewGate(session.status, session.endsAt, nowInAmman()),
    [session.endsAt, session.status],
  );

  const rows = useMemo(() => review.data ?? [], [review.data]);
  const totals = useMemo(() => mergeSummary(summary.data, rows), [rows, summary.data]);

  const retry = useCallback((): void => {
    void review.refetch();
    void summary.refetch();
  }, [review, summary]);

  /** 10.2's *Mark paid*: "Sets paid_fils = expected_fils, status paid. One tap." */
  const markPaid = useCallback(
    (row: ReviewRow): void => {
      setBusyBookingId(row.bookingId);
      recordPayment.mutate(
        {
          bookingId: row.bookingId,
          sessionId: session.id,
          paidFils: row.expectedFils,
          method: null,
          note: null,
        },
        { onSettled: () => setBusyBookingId(null) },
      );
    },
    [recordPayment, session.id],
  );

  /** 10.2's *Not paid*: "Sets paid_fils = 0, creates a balance entry for the full amount." */
  const markNotPaid = useCallback(
    (row: ReviewRow): void => {
      setBusyBookingId(row.bookingId);
      recordPayment.mutate(
        {
          bookingId: row.bookingId,
          sessionId: session.id,
          paidFils: 0 as Fils,
          method: null,
          note: null,
        },
        { onSettled: () => setBusyBookingId(null) },
      );
    },
    [recordPayment, session.id],
  );

  const removeRow = useCallback(
    (row: ReviewRow): void => {
      // 15.2's dialog owns the credit return prompt, so the row is handed over
      // in the shape that dialog already takes rather than duplicating it.
      onRemove({
        bookingId: row.bookingId,
        kind: row.kind,
        displayName: row.displayName,
        tier: row.tier,
        paymentMethod: row.paymentMethod,
        expectedFils: row.expectedFils,
        isCoachSlot: row.isCoachSlot,
        playerId: row.playerId,
      });
    },
    [onRemove],
  );

  const openPlayer = useCallback(
    (row: ReviewRow): void => {
      if (row.playerId !== null) onOpenPlayer(row.playerId);
    },
    [onOpenPlayer],
  );

  const closePartial = useCallback((): void => setPartialRow(null), []);
  const closeMethod = useCallback((): void => setMethodRow(null), []);
  const closeProof = useCallback((): void => setProofRow(null), []);
  const closeDialog = useCallback((): void => setDialog(null), []);
  const openConfirm = useCallback((): void => setDialog('confirm'), []);
  const openReopen = useCallback((): void => setDialog('reopen'), []);

  const runDialog = useCallback((): void => {
    const mutation = dialog === 'reopen' ? reopenReview : confirmReview;
    mutation.mutate(session.id, { onSuccess: () => setDialog(null) });
  }, [confirmReview, dialog, reopenReview, session.id]);

  return (
    <View style={{ gap: theme.spacing.md }} testID="manage-money">
      {gate.noticeKey === null ? null : (
        <Chip
          label={t(gate.noticeKey)}
          tone={gate.availability === 'locked' ? 'danger' : 'info'}
          testID="money-notice"
        />
      )}

      {review.isPending ? (
        <SkeletonCard testID="money-loading" />
      ) : review.isError ? (
        <ErrorState
          message={t(paymentErrorMessageKey(review.error))}
          onRetry={retry}
          isRetrying={review.isFetching}
          testID="money-error"
        />
      ) : rows.length === 0 ? (
        <EmptyState message={t('admin.money.empty')} testID="money-empty" />
      ) : (
        <Card>
          {/* The list scrolls inside the card rather than the screen, so the
              footer below stays where 10.2 wants it: always visible. */}
          <ScrollView style={{ maxHeight: 520 }} nestedScrollEnabled testID="money-rows">
            {rows.map((row) => (
              <PaymentRow
                key={row.bookingId}
                row={row}
                canEdit={gate.canEdit}
                isBusy={busyBookingId === row.bookingId}
                onMarkPaid={markPaid}
                onPartial={setPartialRow}
                onNotPaid={markNotPaid}
                onViewProof={setProofRow}
                onChangeMethod={setMethodRow}
                onRemove={removeRow}
                onOpenPlayer={openPlayer}
                testID={`money-row-${row.bookingId}`}
              />
            ))}
          </ScrollView>
        </Card>
      )}

      {recordPayment.isError ? (
        <Text variant="small" tone="danger" testID="money-record-error">
          {t(paymentErrorMessageKey(recordPayment.error))}
        </Text>
      ) : null}

      <Card testID="money-footer">
        <Text variant="heading">{t('admin.money.summary')}</Text>
        <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.sm }}>
          <TotalLine
            label={t('admin.money.expectedTotal')}
            amount={totals.expectedFils}
            testID="money-expected"
          />
          <TotalLine
            label={t('admin.money.collectedTotal')}
            amount={totals.collectedFils}
            tone="accent"
            testID="money-collected"
          />
          {/* 12.2 rule 1: a credit is worth its subscription's per-visit rate,
              between 4.000 and 5.000 JD, never the 6 JD session price. */}
          {totals.creditRevenueFils > 0 ? (
            <TotalLine
              label={t('admin.money.creditRevenue')}
              amount={totals.creditRevenueFils}
              testID="money-credit-revenue"
            />
          ) : null}
          <TotalLine
            label={t('admin.money.outstandingTotal')}
            amount={totals.outstandingFils}
            tone={totals.outstandingFils > 0 ? 'warning' : 'secondary'}
            testID="money-outstanding"
          />
          <TotalLine label={t('admin.money.cost')} amount={totals.costFils} testID="money-cost" />
          <TotalLine
            label={t('admin.money.profit')}
            amount={totals.profitFils}
            tone={totals.profitFils >= 0 ? 'accent' : 'warning'}
            testID="money-profit"
          />
          {/* 12.3: "the coach will want both numbers". */}
          {totals.outstandingFils > 0 ? (
            <TotalLine
              label={t('admin.money.profitIfCollected')}
              amount={totals.profitIfCollectedFils}
              tone="secondary"
              testID="money-profit-if-collected"
            />
          ) : null}
        </View>

        {summary.isError ? (
          <Text variant="caption" tone="tertiary" style={{ paddingTop: theme.spacing.sm }}>
            {t('admin.money.costUnavailable')}
          </Text>
        ) : null}
      </Card>

      {/* Under the footer, because the coach reads the totals first and only
          then asks why the cost line says what it says. */}
      <SessionCostsCard sessionId={session.id} canEdit={gate.canEdit} />

      {/* 10.2's header action, placed at the foot because it is the last thing
          he does, after every row above it. */}
      {gate.canConfirm ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Button
            label={t('admin.money.confirmSession')}
            onPress={openConfirm}
            isLoading={confirmReview.isPending}
            isFullWidth
            testID="money-confirm"
          />
          {gate.canReopen ? (
            <Button
              label={t('admin.money.reopen')}
              onPress={openReopen}
              variant="ghost"
              isLoading={reopenReview.isPending}
              isFullWidth
              testID="money-reopen"
            />
          ) : null}
        </View>
      ) : null}

      {/* Each sheet is mounted only while it is open and keyed by the booking
          it is about, so its fields start from that row rather than from
          whichever row was open last. */}
      {partialRow === null ? null : (
        <PartialPaymentSheet
          key={partialRow.bookingId}
          row={partialRow}
          sessionId={session.id}
          onClose={closePartial}
        />
      )}
      {methodRow === null ? null : (
        <ChangeMethodSheet
          key={methodRow.bookingId}
          row={methodRow}
          sessionId={session.id}
          onClose={closeMethod}
        />
      )}
      <ProofViewer
        storagePath={proofRow?.proofPath ?? null}
        title={proofRow?.displayName ?? ''}
        onClose={closeProof}
      />
      <ConfirmReviewDialog
        mode={dialog}
        unsettledCount={totals.unsettledCount}
        outstandingFils={totals.outstandingFils}
        isRunning={confirmReview.isPending || reopenReview.isPending}
        errorKey={
          confirmReview.isError
            ? paymentErrorMessageKey(confirmReview.error)
            : reopenReview.isError
              ? paymentErrorMessageKey(reopenReview.error)
              : null
        }
        onConfirm={runDialog}
        onCancel={closeDialog}
      />
    </View>
  );
};

export default SessionMoneyTab;
