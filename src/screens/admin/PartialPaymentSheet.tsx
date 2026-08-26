/**
 * 10.2's *Partial*: "Opens a numeric input, prefilled with expected_fils.
 * Entering less creates a balance entry for the remainder."
 *
 * Prefilled with the full amount rather than empty, because the coach opens
 * this having been handed *some* money and needs to edit a number down, not
 * compose one from nothing. D38.
 *
 * The remainder is shown live, since that is the figure he is actually
 * deciding about — what this person will still owe when he walks out.
 *
 * The sheet takes a row rather than a row-or-null and is mounted only while it
 * is open, keyed by the booking. That is what makes the prefill correct for
 * every row without an effect resetting state behind the render: a different
 * row is a different component, with its own `useState` initialiser and its own
 * mutation, rather than the same one being re-primed.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, NumericInput, Sheet, Text } from '@/components/primitives';
import { paymentErrorMessageKey } from '@/features/payments/errors';
import { useRecordPayment } from '@/features/payments/mutations';
import { partialPaymentSchema, toFils } from '@/features/payments/schemas';
import type { ReviewRow } from '@/features/payments/types';
import { formatMoney, toJD, type Fils } from '@/lib/money';
import { useTheme } from '@/theme';

export interface PartialPaymentSheetProps {
  /** Never null: the caller mounts this only while the sheet is open. */
  row: ReviewRow;
  sessionId: string;
  onClose: () => void;
}

/** The expected amount as a typed string: "6" rather than "6.000". */
function prefill(expectedFils: Fils): string {
  const jd = toJD(expectedFils);
  return Number.isInteger(jd) ? String(jd) : jd.toFixed(3);
}

export const PartialPaymentSheet: React.FC<PartialPaymentSheetProps> = ({
  row,
  sessionId,
  onClose,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [amount, setAmount] = useState(() => prefill(row.expectedFils));
  const recordPayment = useRecordPayment();

  const validation = useMemo((): { isValid: boolean; errorKey: string | null } => {
    const result = partialPaymentSchema(row.expectedFils).safeParse({ amount });
    return {
      isValid: result.success,
      errorKey: result.success ? null : (result.error.issues[0]?.message ?? null),
    };
  }, [amount, row]);

  const remainder = useMemo((): Fils | null => {
    if (!validation.isValid) return null;
    return (row.expectedFils - toFils(amount)) as Fils;
  }, [amount, row, validation.isValid]);

  const submit = useCallback((): void => {
    if (!validation.isValid) return;

    recordPayment.mutate(
      {
        bookingId: row.bookingId,
        sessionId,
        paidFils: toFils(amount),
        method: null,
        note: null,
      },
      { onSuccess: onClose },
    );
  }, [amount, onClose, recordPayment, row, sessionId, validation.isValid]);

  return (
    <Sheet
      isVisible
      title={t('admin.money.partialTitle')}
      onClose={onClose}
      isDismissDisabled={recordPayment.isPending}
      testID="partial-sheet"
    >
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="body">{row.displayName}</Text>
        <Text variant="small" tone="secondary">
          {t('admin.money.expectedLine', {
            amount: formatMoney(row.expectedFils, theme.locale),
          })}
        </Text>

        <NumericInput
          label={t('admin.money.amountReceived')}
          value={amount}
          onChangeText={setAmount}
          suffix={t('common.jd')}
          {...(validation.errorKey === null || amount === ''
            ? {}
            : { errorMessage: t(validation.errorKey) })}
          testID="partial-amount"
        />

        {remainder === null ? null : (
          <Text
            variant="small"
            tone={remainder > 0 ? 'warning' : 'secondary'}
            testID="partial-remainder"
          >
            {remainder > 0
              ? t('admin.money.remainderLine', {
                  amount: formatMoney(remainder, theme.locale),
                })
              : t('admin.money.remainderNone')}
          </Text>
        )}

        {recordPayment.isError ? (
          <Text variant="small" tone="danger" testID="partial-error">
            {t(paymentErrorMessageKey(recordPayment.error))}
          </Text>
        ) : null}

        <Button
          label={t('common.save')}
          onPress={submit}
          isDisabled={!validation.isValid}
          isLoading={recordPayment.isPending}
          isFullWidth
          testID="partial-save"
        />
      </View>
    </Sheet>
  );
};

export default PartialPaymentSheet;
