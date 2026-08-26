/**
 * 10.2's *Change method*: "In case the player said CliQ and turned up with
 * cash."
 *
 * Three options, not four. A47: a credit booking cannot change method here,
 * because moving it off credit would strand the ledger row that paid for it
 * and moving one onto credit would need a subscription chosen and a
 * transaction written, which is `create_booking`'s job. The coach's route for
 * a credit row is *Remove from session*, which returns the credit, then re-add.
 * `PaymentRow` does not offer this action on a credit row at all.
 *
 * Choosing *free* waives the amount: 10.1's table defines free as expecting
 * nothing, so the price goes to zero and any balance entry for the row goes
 * with it. The sheet says so before he taps.
 *
 * Mounted only while it is open and keyed by the booking, like the partial
 * sheet, so the selection starts from the row's own method without an effect
 * resetting state behind the render.
 */
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, SegmentedControl, Sheet, Text } from '@/components/primitives';
import { paymentErrorMessageKey } from '@/features/payments/errors';
import { useRecordPayment } from '@/features/payments/mutations';
import {
  REVIEWABLE_METHODS,
  type ReviewRow,
  type ReviewablePaymentMethod,
} from '@/features/payments/types';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

export interface ChangeMethodSheetProps {
  /** Never null: the caller mounts this only while the sheet is open. */
  row: ReviewRow;
  sessionId: string;
  onClose: () => void;
}

const LABEL_KEYS: Record<ReviewablePaymentMethod, string> = {
  cash: 'bookings.methodCash',
  cliq: 'bookings.methodCliq',
  free: 'bookings.methodFree',
};

export const ChangeMethodSheet: React.FC<ChangeMethodSheetProps> = ({
  row,
  sessionId,
  onClose,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  // PaymentRow does not offer this action on a credit row (A47), so the
  // fallback below is a type-level one rather than a reachable state.
  const [method, setMethod] = useState<ReviewablePaymentMethod>(() =>
    row.paymentMethod === 'credit' ? 'cash' : row.paymentMethod,
  );
  const recordPayment = useRecordPayment();

  const submit = useCallback((): void => {
    recordPayment.mutate(
      {
        bookingId: row.bookingId,
        sessionId,
        // Free waives the amount, so nothing can have been paid against it.
        // Otherwise what he already recorded stands: a method change is not a
        // payment. A7.
        paidFils: method === 'free' ? (0 as typeof row.paidFils) : row.paidFils,
        method,
        note: null,
      },
      { onSuccess: onClose },
    );
  }, [method, onClose, recordPayment, row, sessionId]);

  return (
    <Sheet
      isVisible
      title={t('admin.money.changeMethodTitle')}
      onClose={onClose}
      isDismissDisabled={recordPayment.isPending}
      testID="change-method-sheet"
    >
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="body">{row.displayName}</Text>

        <SegmentedControl
          label={t('admin.money.changeMethodTitle')}
          options={REVIEWABLE_METHODS.map((value) => ({
            value,
            label: t(LABEL_KEYS[value]),
          }))}
          value={method}
          onChange={setMethod}
          testID="change-method-options"
        />

        {method === 'free' ? (
          <Text variant="small" tone="warning" testID="change-method-free-note">
            {t('admin.money.freeWaivesNote', {
              amount: formatMoney(row.expectedFils, theme.locale),
            })}
          </Text>
        ) : null}

        {recordPayment.isError ? (
          <Text variant="small" tone="danger" testID="change-method-error">
            {t(paymentErrorMessageKey(recordPayment.error))}
          </Text>
        ) : null}

        <Button
          label={t('common.save')}
          onPress={submit}
          isLoading={recordPayment.isPending}
          isFullWidth
          testID="change-method-save"
        />
      </View>
    </Sheet>
  );
};

export default ChangeMethodSheet;
