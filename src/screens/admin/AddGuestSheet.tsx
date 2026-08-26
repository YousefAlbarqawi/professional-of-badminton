/**
 * Add a guest. BUILD-SPEC 15.2, D44, D45, D46.
 *
 * "Name (required), tier (required, defaults to B), and a payment segment:
 * Paid with an amount field defaulting to the session price, or Free. A hint
 * reads: 'Free guests fill empty spots and are not counted as income.'"
 *
 * D46 is the rule that shapes what is absent: guests are not remembered. There
 * is no autocomplete here, no recent list and no lookup, because there is
 * nothing to look up — every guest is typed fresh every time.
 *
 * The tier is nine badges rather than a segmented control, because nine
 * segments on a phone are unreadable and 17.2 already gives the badge a shape
 * and a 28pt floor. Each one is a button; the chosen one is outlined, which is
 * the same "this one is yours" the attendee list uses at level 1.
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button, Chip, FormField, SegmentedControl, Sheet, Text } from '@/components/primitives';
import { TierBadge } from '@/components/domain';
import { bookingErrorMessageKey } from '@/features/bookings/errors';
import { useAddGuest } from '@/features/bookings/mutations';
import { addGuestSchema, type AddGuestForm } from '@/features/bookings/schemas';
import { fils, formatMoney, toJD, type Fils } from '@/lib/money';
import { TIERS, type Tier } from '@/lib/tiers';
import { useTheme } from '@/theme';

export interface AddGuestSheetProps {
  isVisible: boolean;
  sessionId: string;
  /** The amount field defaults to this. 15.2. */
  sessionPriceFils: Fils;
  onClose: () => void;
}

/** D44: tier is required and defaults to B. */
const DEFAULT_TIER: Tier = 'B';

type PaymentSegment = 'paid' | 'free';

export const AddGuestSheet: React.FC<AddGuestSheetProps> = ({
  isVisible,
  sessionId,
  sessionPriceFils,
  onClose,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const addGuest = useAddGuest();

  const { control, handleSubmit, setValue, reset } = useForm<AddGuestForm>({
    resolver: zodResolver(addGuestSchema),
    mode: 'onChange',
    defaultValues: {
      guestName: '',
      guestTier: DEFAULT_TIER,
      isFree: false,
      amountJD: String(toJD(sessionPriceFils)),
    },
  });

  const isFree = useWatch({ control, name: 'isFree' });
  const guestTier = useWatch({ control, name: 'guestTier' });

  const paymentOptions = useMemo(
    () => [
      { value: 'paid' as const, label: t('admin.addGuest.paid') },
      { value: 'free' as const, label: t('admin.addGuest.free') },
    ],
    [t],
  );

  const close = useCallback((): void => {
    reset();
    addGuest.reset();
    onClose();
  }, [addGuest, onClose, reset]);

  const selectTier = useCallback(
    (tier: Tier): void => setValue('guestTier', tier, { shouldValidate: true }),
    [setValue],
  );

  const setPayment = useCallback(
    (value: PaymentSegment): void => setValue('isFree', value === 'free', { shouldValidate: true }),
    [setValue],
  );

  const submit = handleSubmit((form: AddGuestForm) => {
    addGuest.mutate(
      {
        sessionId,
        guestName: form.guestName.trim(),
        guestTier: form.guestTier,
        isFree: form.isFree,
        // D45: free means zero, and the server ignores the amount either way.
        amountFils: form.isFree ? null : fils(Number(form.amountJD.trim())),
      },
      { onSuccess: close },
    );
  });

  const onSubmit = useCallback((): void => {
    void submit();
  }, [submit]);

  return (
    <Sheet
      isVisible={isVisible}
      title={t('admin.addGuest.title')}
      onClose={close}
      isDismissDisabled={addGuest.isPending}
      testID="add-guest-sheet"
    >
      <FormField
        control={control}
        name="guestName"
        label={t('admin.addGuest.name')}
        autoCapitalize="words"
        testID="guest-name"
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="caption" tone="tertiary">
          {t('admin.addGuest.tier')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {[...TIERS].reverse().map((tier) => (
            <Pressable
              key={tier}
              onPress={() => selectTier(tier)}
              accessibilityRole="radio"
              accessibilityState={{ selected: tier === guestTier }}
              testID={`guest-tier-${tier}`}
              // 17.4: minimum touch target 44x44. The badge itself is 28.
              style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
            >
              <TierBadge tier={tier} isSelf={tier === guestTier} />
            </Pressable>
          ))}
        </View>
      </View>

      <SegmentedControl
        label={t('admin.addGuest.payment')}
        options={paymentOptions}
        value={isFree ? 'free' : 'paid'}
        onChange={setPayment}
        testID="guest-payment"
      />

      {isFree ? (
        <Text variant="small" tone="secondary" testID="guest-free-hint">
          {t('admin.addGuest.freeHint')}
        </Text>
      ) : (
        <FormField
          control={control}
          name="amountJD"
          label={t('admin.addGuest.amount')}
          hint={formatMoney(sessionPriceFils, theme.locale)}
          keyboardType="decimal-pad"
          testID="guest-amount"
        />
      )}

      {addGuest.isError ? (
        <Chip
          label={t(bookingErrorMessageKey(addGuest.error))}
          tone="danger"
          testID="guest-error"
        />
      ) : null}

      <Button
        label={t('admin.addGuest.add')}
        onPress={onSubmit}
        isLoading={addGuest.isPending}
        isFullWidth
        testID="guest-submit"
      />
    </Sheet>
  );
};

export default AddGuestSheet;
