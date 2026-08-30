/**
 * One row of the review screen. BUILD-SPEC 10.2 and 17.3's `PaymentRow`.
 *
 * "Each row shows: name or guest name, tier badge, method icon, expected
 * amount, paid amount, and status chip."
 *
 * ── The shape of the row ──────────────────────────────────
 * 10.2 says *Mark paid* "is the common case and must be the largest touch
 * target on the row". So the row is two bands: the identity and the money on
 * top, and the actions underneath, with *Mark paid* taking the full width and
 * everything else sharing a line below it. A coach standing in a gym works
 * down a list tapping one button per person; that button should be impossible
 * to miss and the others should not compete with it.
 *
 * When there is nothing to mark — a free guest, a coach slot, a zero custom
 * rate, or a row already paid in full — the primary button is absent rather
 * than disabled, so the eye skips the row instead of stopping at a dead
 * control.
 *
 * ── Settling a row, and unsettling it ─────────────────────
 * *Partial* and *Not paid* are the two ways a row lands somewhere other than
 * paid in full, so they are one pair sharing a full-width line, half each.
 * They disappear entirely in the two cases where neither can do anything:
 *
 *   - **Nothing due.** A free guest, a coach slot or a 0 JD custom rate has no
 *     amount to take part of and none to record as owed. 12.2 rule 2. What
 *     changes such a row is *Change method*, not either of these.
 *   - **Paid in full.** Both would be undoing what was just recorded, which is
 *     a rarer act than settling and should not sit at the same weight as one.
 *     It gets a quiet text link instead — the same reversal, one tap, plainly
 *     labelled, and not competing with the row below it.
 *
 * Both were previously rendered greyed out in these states, which put two dead
 * controls on nearly every row of a reviewed session.
 *
 * ── Read only ─────────────────────────────────────────────
 * After the 7 day lock every control disappears and the row renders as a
 * record. D39: "There is no unlock."
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Chip, Text } from '@/components/primitives';
import {
  canChangeMethod,
  canMarkPaid,
  canViewProof,
  statusLabelKey,
  statusTone,
} from '@/features/payments/reviewState';
import type { ReviewRow } from '@/features/payments/types';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

import { PaymentMethodChip } from './PaymentMethodChip';
import { TierBadge } from './TierBadge';

export interface PaymentRowProps {
  row: ReviewRow;
  /** False once the session has locked. Every action follows this. 10.2. */
  canEdit: boolean;
  /** True while this row's own mutation is in flight. */
  isBusy?: boolean;
  onMarkPaid: (row: ReviewRow) => void;
  onPartial: (row: ReviewRow) => void;
  onNotPaid: (row: ReviewRow) => void;
  onViewProof: (row: ReviewRow) => void;
  onChangeMethod: (row: ReviewRow) => void;
  onRemove: (row: ReviewRow) => void;
  /** 15.8 section 6. Absent for a guest, who has no profile and no balance. */
  onOpenPlayer?: ((row: ReviewRow) => void) | undefined;
  testID?: string | undefined;
}

export const PaymentRow: React.FC<PaymentRowProps> = ({
  row,
  canEdit,
  isBusy = false,
  onMarkPaid,
  onPartial,
  onNotPaid,
  onViewProof,
  onChangeMethod,
  onRemove,
  onOpenPlayer,
  testID,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const markPaid = useCallback((): void => onMarkPaid(row), [onMarkPaid, row]);
  const partial = useCallback((): void => onPartial(row), [onPartial, row]);
  const notPaid = useCallback((): void => onNotPaid(row), [onNotPaid, row]);
  const viewProof = useCallback((): void => onViewProof(row), [onViewProof, row]);
  const changeMethod = useCallback((): void => onChangeMethod(row), [onChangeMethod, row]);
  const remove = useCallback((): void => onRemove(row), [onRemove, row]);

  // A guest has no account and is not remembered (D44, D46), so there is no
  // profile to open and no balance to look at. The name is inert for him.
  const canOpenPlayer = onOpenPlayer !== undefined && row.playerId !== null;
  const openPlayer = useCallback((): void => {
    if (onOpenPlayer !== undefined) onOpenPlayer(row);
  }, [onOpenPlayer, row]);

  const caption = useMemo(() => {
    if (row.kind === 'guest') return t('admin.manage.guestLabel');
    if (row.kind === 'coach') return t('admin.manage.coachLabel');
    return null;
  }, [row.kind, t]);

  // Nothing is due of him at all — see the note at the top of this file.
  const isNothingDue = row.expectedFils === 0;
  const isPaidInFull = !isNothingDue && row.paidFils === row.expectedFils;
  const canSettle = !isNothingDue && !isPaidInFull;

  return (
    <View
      testID={testID}
      style={{
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <TierBadge tier={row.tier} />
        {/* The name opens 15.8's profile, which is where the balance this row
            is about to create can be seen and settled. */}
        <Pressable
          style={{ flex: 1, gap: 2, minHeight: theme.minTouchTarget, justifyContent: 'center' }}
          onPress={canOpenPlayer ? openPlayer : undefined}
          disabled={!canOpenPlayer}
          accessibilityRole={canOpenPlayer ? 'button' : 'text'}
          accessibilityLabel={row.displayName}
          testID={`${testID ?? 'row'}-name`}
        >
          <Text variant="body" weight="600" numberOfLines={2}>
            {row.displayName}
          </Text>
          {caption === null ? null : (
            <Text variant="caption" tone="tertiary">
              {caption}
            </Text>
          )}
        </Pressable>
        <View style={{ alignItems: 'flex-end', gap: theme.spacing.xs }}>
          {/* Paid of expected, in that order, because the coach is checking
              what arrived against what was due. */}
          <Text variant="body" weight="600" testID={`${testID ?? 'row'}-amounts`}>
            {`${formatMoney(row.paidFils, theme.locale)} / ${formatMoney(
              row.expectedFils,
              theme.locale,
            )}`}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <PaymentMethodChip method={row.paymentMethod} />
            <Chip
              label={t(statusLabelKey(row.paymentStatus))}
              tone={statusTone(row.paymentStatus)}
              testID={`${testID ?? 'row'}-status`}
            />
          </View>
        </View>
      </View>

      {canEdit ? (
        <View style={{ gap: theme.spacing.sm }}>
          {/* 10.2: the largest touch target on the row. */}
          {canMarkPaid(row) ? (
            <Button
              label={t('admin.money.markPaid')}
              onPress={markPaid}
              isLoading={isBusy}
              isFullWidth
              testID={`${testID ?? 'row'}-mark-paid`}
            />
          ) : null}

          {/* Half the line each. `flex: 1` on both children rather than a
              percentage width, so the gap between them comes out of the line
              instead of overflowing it, and the pair still fills the row on
              any phone width. */}
          {canSettle ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Button
                label={t('admin.money.partial')}
                onPress={partial}
                variant="secondary"
                style={styles.half}
                testID={`${testID ?? 'row'}-partial`}
              />
              <Button
                label={t('admin.money.notPaid')}
                onPress={notPaid}
                variant="secondary"
                isDisabled={row.paidFils === 0}
                style={styles.half}
                testID={`${testID ?? 'row'}-not-paid`}
              />
            </View>
          ) : null}

          {isPaidInFull ? (
            <Text
              variant="small"
              tone="accent"
              accessibilityRole="button"
              onPress={notPaid}
              testID={`${testID ?? 'row'}-undo-paid`}
            >
              {t('admin.money.undoPaid')}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {canViewProof(row) ? (
              <Button
                label={t('admin.money.viewProof')}
                onPress={viewProof}
                variant="ghost"
                testID={`${testID ?? 'row'}-view-proof`}
              />
            ) : null}
            {canChangeMethod(row) ? (
              <Button
                label={t('admin.money.changeMethod')}
                onPress={changeMethod}
                variant="ghost"
                testID={`${testID ?? 'row'}-change-method`}
              />
            ) : null}
            <Button
              label={t('admin.money.removeFromSession')}
              onPress={remove}
              variant="ghost"
              testID={`${testID ?? 'row'}-remove`}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  half: {
    flex: 1,
    // `Button` sets `alignSelf` from `isFullWidth`, and 'flex-start' would
    // shrink each half back to its label. This is the pair's own layout.
    alignSelf: 'auto',
  },
});

export default PaymentRow;
