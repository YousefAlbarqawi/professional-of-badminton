/**
 * Add an assistant coach. BUILD-SPEC 15.2, D17, D47, D76.
 *
 * "Picks from profiles with role = 'assistant_coach', then a paid or unpaid
 * toggle. The card shows the daily fee and warns when that coach is already on
 * another session the same night: 'Already added tonight. The 10 JD fee is
 * counted once.'"
 *
 * The paid toggle is about the fee the academy owes *him* — D17 — not about
 * anything he pays. He takes a court slot and pays nothing, per D47, which is
 * why there is no payment method here at all.
 *
 * The daily fee is a constant here rather than a read. It is effective dated
 * in `coach_fee_rates` and the server is what charges it; this line is the
 * coach being reminded what a night costs, and 12.1 and D76 both fix it at
 * 10 JD.
 */
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PlayerRow } from '@/components/domain';
import { Button, Chip, SegmentedControl, Sheet, Text } from '@/components/primitives';
import { bookingErrorMessageKey } from '@/features/bookings/errors';
import { useAddCoach } from '@/features/bookings/mutations';
import { useCoachOptions } from '@/features/bookings/queries';
import type { CoachOption } from '@/features/bookings/types';
import { fils, formatMoney } from '@/lib/money';
import { useTheme } from '@/theme';

export interface AddCoachSheetProps {
  isVisible: boolean;
  sessionId: string;
  onClose: () => void;
}

/** D76: an assistant coach costs 10 JD per day, not per session. */
const DAILY_FEE = fils(10);

type FeeSegment = 'unpaid' | 'paid';

export const AddCoachSheet: React.FC<AddCoachSheetProps> = ({ isVisible, sessionId, onClose }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const options = useCoachOptions(sessionId, isVisible);
  const addCoach = useAddCoach();

  const [selected, setSelected] = useState<CoachOption | null>(null);
  const [fee, setFee] = useState<FeeSegment>('unpaid');

  const close = useCallback((): void => {
    setSelected(null);
    setFee('unpaid');
    addCoach.reset();
    onClose();
  }, [addCoach, onClose]);

  const add = useCallback((): void => {
    if (selected === null) return;
    addCoach.mutate(
      { sessionId, coachId: selected.coachId, isPaid: fee === 'paid' },
      { onSuccess: close },
    );
  }, [addCoach, close, fee, selected, sessionId]);

  const feeOptions = [
    { value: 'unpaid' as const, label: t('admin.addCoach.isUnpaid') },
    { value: 'paid' as const, label: t('admin.addCoach.isPaid') },
  ];

  return (
    <Sheet
      isVisible={isVisible}
      title={t('admin.addCoach.title')}
      onClose={close}
      isDismissDisabled={addCoach.isPending}
      testID="add-coach-sheet"
    >
      <Text variant="small" tone="secondary">
        {t('admin.addCoach.feeLine', { fee: formatMoney(DAILY_FEE, theme.locale) })}
      </Text>

      {(options.data ?? []).length === 0 ? (
        <Text variant="body" tone="secondary" testID="coach-options-empty">
          {options.isPending ? t('common.loading') : t('admin.addCoach.empty')}
        </Text>
      ) : (
        (options.data ?? []).map((option) => (
          <PlayerRow
            key={option.coachId}
            name={option.displayName}
            tier={option.tier}
            caption={
              option.isOnSession
                ? t('admin.addCoach.onSession')
                : option.isOnNight
                  ? // D76: the 10 JD is counted once for the night, so adding
                    // him to a second session costs nothing extra.
                    t('admin.addCoach.onNight', {
                      fee: formatMoney(DAILY_FEE, theme.locale),
                    })
                  : undefined
            }
            isDisabled={option.isOnSession}
            onPress={() => setSelected(option)}
            trailing={
              selected?.coachId === option.coachId ? (
                <Chip label={t('common.confirm')} tone="accent" />
              ) : undefined
            }
            testID={`coach-option-${option.coachId}`}
          />
        ))
      )}

      {selected === null ? null : (
        <View style={{ gap: theme.spacing.md }}>
          <SegmentedControl
            label={t('admin.addCoach.isPaid')}
            options={feeOptions}
            value={fee}
            onChange={setFee}
            testID="coach-fee"
          />

          {addCoach.isError ? (
            <Chip
              label={t(bookingErrorMessageKey(addCoach.error))}
              tone="danger"
              testID="coach-add-error"
            />
          ) : null}

          <Button
            label={t('admin.addCoach.add')}
            onPress={add}
            isLoading={addCoach.isPending}
            isFullWidth
            testID="coach-submit"
          />
        </View>
      )}
    </Sheet>
  );
};

export default AddCoachSheet;
