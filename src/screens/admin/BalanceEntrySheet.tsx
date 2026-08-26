/**
 * 10.3 and 15.8 section 6: "He can add a manual entry (positive to add debt,
 * negative to record a settlement)".
 *
 * One sheet, two directions, chosen with a segmented control rather than by
 * asking the coach to type a minus sign. The two things he actually does are
 * "he owes me more" and "he paid me some", and naming them that way is the
 * difference between a ledger he trusts and one he second-guesses.
 *
 * The note is required. An unexplained number in a ledger the coach will read
 * back in three months is worse than no number at all, which is also why 11.3
 * makes the note required on a credit adjustment.
 *
 * Mounted only while it is open, so the fields start empty every time without
 * an effect clearing them behind the render.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Input,
  NumericInput,
  SegmentedControl,
  Sheet,
  Text,
} from '@/components/primitives';
import { paymentErrorMessageKey } from '@/features/payments/errors';
import { useAddBalanceEntry } from '@/features/payments/mutations';
import { balanceEntrySchema, toFils } from '@/features/payments/schemas';
import { formatMoney, type Fils } from '@/lib/money';
import { useTheme } from '@/theme';

export interface BalanceEntrySheetProps {
  playerId: string;
  /** What he owes now, so the preview can say what it becomes. */
  currentOwedFils: Fils;
  onClose: () => void;
}

type Direction = 'debt' | 'settlement';

export const BalanceEntrySheet: React.FC<BalanceEntrySheetProps> = ({
  playerId,
  currentOwedFils,
  onClose,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [direction, setDirection] = useState<Direction>('debt');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const addEntry = useAddBalanceEntry();

  const signedFils = useMemo((): Fils | null => {
    if (amount === '') return null;
    const magnitude = toFils(amount);
    if (magnitude === 0) return null;
    // 6.2: positive is owed to the coach, negative is a settlement.
    return (direction === 'debt' ? magnitude : -magnitude) as Fils;
  }, [amount, direction]);

  const validation = useMemo(() => balanceEntrySchema.safeParse({ amount, note }), [amount, note]);

  const isValid = validation.success && signedFils !== null;

  const submit = useCallback((): void => {
    if (signedFils === null || !validation.success) return;

    addEntry.mutate(
      { playerId, amountFils: signedFils, note: validation.data.note },
      { onSuccess: onClose },
    );
  }, [addEntry, onClose, playerId, signedFils, validation]);

  return (
    <Sheet
      isVisible
      title={t('admin.balance.addTitle')}
      onClose={onClose}
      isDismissDisabled={addEntry.isPending}
      testID="balance-sheet"
    >
      <View style={{ gap: theme.spacing.md }}>
        <SegmentedControl
          label={t('admin.balance.addTitle')}
          options={[
            { value: 'debt' as const, label: t('admin.balance.addDebt') },
            { value: 'settlement' as const, label: t('admin.balance.recordSettlement') },
          ]}
          value={direction}
          onChange={setDirection}
          testID="balance-direction"
        />

        <NumericInput
          label={t('admin.balance.amount')}
          value={amount}
          onChangeText={setAmount}
          suffix={t('common.jd')}
          testID="balance-amount"
        />

        <Input
          label={t('admin.balance.note')}
          value={note}
          onChangeText={setNote}
          maxLength={200}
          testID="balance-note"
        />

        {signedFils === null ? null : (
          <Text variant="small" tone="secondary" testID="balance-preview">
            {t('admin.balance.preview', {
              from: formatMoney(currentOwedFils, theme.locale),
              to: formatMoney((currentOwedFils + signedFils) as Fils, theme.locale),
            })}
          </Text>
        )}

        {addEntry.isError ? (
          <Text variant="small" tone="danger" testID="balance-error">
            {t(paymentErrorMessageKey(addEntry.error))}
          </Text>
        ) : null}

        <Button
          label={t('common.save')}
          onPress={submit}
          isDisabled={!isValid}
          isLoading={addEntry.isPending}
          isFullWidth
          testID="balance-save"
        />
      </View>
    </Sheet>
  );
};

export default BalanceEntrySheet;
