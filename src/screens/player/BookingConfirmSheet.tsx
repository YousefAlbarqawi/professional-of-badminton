/**
 * The booking confirmation sheet. BUILD-SPEC 14.8.
 *
 * "A bottom sheet, not a screen." 14.0's navigation tree lists a
 * `BookingConfirm` route in the schedule stack; 14.8's first line overrules it,
 * and a sheet is also the only shape that can sit over the session summary the
 * player is deciding from. Recorded as an observation in CONFLICTS FOUND.
 *
 * ── The three options (14.8's table) ──────────────────────
 *   Cash on arrival   "Pay the coach at the venue"            never disabled
 *   CliQ              "Transfer now and attach a screenshot"  never disabled
 *   Use a credit      "3 credits left, expires 14 September"  disabled with
 *                     no usable subscription, and the subtitle becomes
 *                     "No credits available"
 *
 * ── The CliQ path ─────────────────────────────────────────
 * Choosing CliQ opens 14.8's sub-flow rather than confirming: the alias with a
 * copy button, the amount, *Attach screenshot*, then a thumbnail with
 * *Replace*. Confirm stays disabled until an image is attached.
 *
 * 10.1: "create_booking is called only after the upload succeeds", and "a
 * booking must never exist with payment_method = 'cliq' and no proof row". So
 * the CliQ path does not go through `useCreateBooking` at all — it goes
 * through `useCreateCliqBooking`, which reserves the id, uploads, and then
 * writes the booking and its proof in one transaction. A deferred constraint
 * trigger enforces the rule underneath, so it holds even if this screen is
 * bypassed entirely.
 *
 * ── The amount ────────────────────────────────────────────
 * "If the player's custom rate is set, the amount shown is his rate, with no
 * explanation of why it differs from the poster price. He knows." D41.
 *
 * ── The extended top-up line ──────────────────────────────
 * D53 and 11.4: on an extended session paid by credit the price difference is
 * settled with the coach in person and is recorded nowhere in the app. One
 * informational line, and no balance entry, no prompt, no report line.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Card, Chip, Sheet, Text, WhatsAppButton } from '@/components/primitives';
import { isSessionFull, bookingErrorMessageKey } from '@/features/bookings/errors';
import { useCreateBooking } from '@/features/bookings/mutations';
import { PLAYER_PAYMENT_METHODS, type PlayerPaymentMethod } from '@/features/bookings/types';
import { useCreateCliqBooking } from '@/features/payments/mutations';
import type { PreparedProof } from '@/features/payments/types';
import type { Session } from '@/features/sessions/types';
import { useMyCredits } from '@/features/subscriptions/queries';
import type { CreditSummary } from '@/features/subscriptions/types';
import { hapticBookingSuccess } from '@/lib/haptics';
import { formatMoney, type Fils } from '@/lib/money';
import { formatSessionDate, formatSessionTime, parseInstant } from '@/lib/time';
import { useTheme } from '@/theme';

import { CliqPaymentStep } from './CliqPaymentStep';

export interface BookingConfirmSheetProps {
  isVisible: boolean;
  session: Session;
  /** Already resolved to his own rate when he has one. D41. */
  payableFils: Fils;
  onClose: () => void;
  /** 14.8: the *Join the waiting list* button on the session_full state. */
  onJoinWaitlist: () => void;
}

interface MethodOptionProps {
  method: PlayerPaymentMethod;
  isSelected: boolean;
  isDisabled: boolean;
  subtitle: string;
  onSelect: (method: PlayerPaymentMethod) => void;
}

const TITLE_KEYS: Record<PlayerPaymentMethod, string> = {
  cash: 'payment.cash',
  cliq: 'payment.cliq',
  credit: 'payment.credit',
};

const MethodOption: React.FC<MethodOptionProps> = ({
  method,
  isSelected,
  isDisabled,
  subtitle,
  onSelect,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const select = useCallback((): void => onSelect(method), [method, onSelect]);

  return (
    <Pressable
      testID={`payment-option-${method}`}
      onPress={select}
      disabled={isDisabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      accessibilityLabel={t(TITLE_KEYS[method])}
      style={{
        minHeight: 44,
        borderWidth: 1,
        borderColor: isSelected ? theme.colors.accent : theme.colors.border,
        backgroundColor: isSelected ? theme.colors.bgSurface : 'transparent',
        borderRadius: theme.radii.md,
        padding: theme.spacing.md,
        gap: 2,
        opacity: isDisabled ? 0.5 : 1,
      }}
    >
      <Text variant="body" weight="600">
        {t(TITLE_KEYS[method])}
      </Text>
      <Text variant="small" tone="secondary">
        {subtitle}
      </Text>
    </Pressable>
  );
};

/**
 * 14.8's credit subtitle: "3 credits left, expires 14 September", or "No
 * credits available" when there is nothing to spend. The date is the nearest
 * expiry, which is the subscription `pick_subscription` would take it from.
 */
function creditSubtitleArgs(
  credits: CreditSummary | undefined,
  locale: 'en' | 'ar',
): { key: string; count: number; date: string } {
  if (credits === undefined || !credits.hasUsableCredit) {
    return { key: 'payment.noCredits', count: 0, date: '' };
  }

  return {
    key: 'payment.creditSub',
    count: credits.total,
    date:
      credits.nextExpiry === null
        ? ''
        : // Midday UTC is comfortably inside the same Amman calendar day
          // whichever side of the offset it is read from.
          formatSessionDate(parseInstant(`${credits.nextExpiry}T12:00:00Z`), locale),
  };
}

export const BookingConfirmSheet: React.FC<BookingConfirmSheetProps> = ({
  isVisible,
  session,
  payableFils,
  onClose,
  onJoinWaitlist,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const credits = useMyCredits();
  const createBooking = useCreateBooking();
  const createCliqBooking = useCreateCliqBooking();

  const [method, setMethod] = useState<PlayerPaymentMethod>('cash');
  const [proof, setProof] = useState<PreparedProof | null>(null);
  const [isDone, setIsDone] = useState(false);

  const hasCredit = credits.data?.hasUsableCredit ?? false;
  const isCliq = method === 'cliq';

  // Whichever path the chosen method takes. The sheet reads one error, one
  // pending flag and one reset, so nothing below has to know which.
  const active = isCliq ? createCliqBooking : createBooking;

  const subtitles = useMemo<Record<PlayerPaymentMethod, string>>(
    () => ({
      cash: t('payment.cashSub'),
      cliq: t('payment.cliqSub'),
      credit: ((): string => {
        const args = creditSubtitleArgs(credits.data, theme.locale);
        return t(args.key, { count: args.count, date: args.date });
      })(),
    }),
    [credits.data, t, theme.locale],
  );

  // 17.4: "Haptic feedback on booking success". One handler for both paths so
  // neither can drift from the other.
  const onBookingSuccess = useCallback((): void => {
    hapticBookingSuccess();
    setIsDone(true);
  }, []);

  const confirm = useCallback((): void => {
    if (isCliq) {
      // 14.8: the confirm button is disabled until an image is attached, so
      // this cannot be reached without one. The guard is here because the type
      // says it could be.
      if (proof === null) return;

      createCliqBooking.mutate({ sessionId: session.id, proof }, { onSuccess: onBookingSuccess });
      return;
    }

    createBooking.mutate({ sessionId: session.id, method }, { onSuccess: onBookingSuccess });
  }, [createBooking, createCliqBooking, isCliq, method, onBookingSuccess, proof, session.id]);

  const close = useCallback((): void => {
    setIsDone(false);
    createBooking.reset();
    createCliqBooking.reset();
    setMethod('cash');
    setProof(null);
    onClose();
  }, [createBooking, createCliqBooking, onClose]);

  const joinWaitlist = useCallback((): void => {
    createBooking.reset();
    createCliqBooking.reset();
    onJoinWaitlist();
  }, [createBooking, createCliqBooking, onJoinWaitlist]);

  // Switching away from CliQ drops the screenshot. Keeping it would mean a
  // cash booking holding an image nothing will ever upload.
  const chooseMethod = useCallback((next: PlayerPaymentMethod): void => {
    setMethod(next);
    if (next !== 'cliq') setProof(null);
  }, []);

  const lostTheSpot = isSessionFull(active.error);

  return (
    <Sheet
      isVisible={isVisible}
      title={isDone ? t('payment.successTitle') : t('payment.sheetTitle')}
      onClose={close}
      isDismissDisabled={active.isPending}
      testID="booking-sheet"
    >
      {isDone ? (
        <View style={{ gap: theme.spacing.md }} testID="booking-success">
          {/* 14.8: "a success state with a checkmark, the session summary, and
              Done". 17.4 puts haptics here too; that lands with the device
              pass in phase 10. */}
          <Text variant="display" tone="accent" accessibilityElementsHidden>
            ✓
          </Text>
          <Text variant="body">
            {t('payment.successBody', {
              venue: session.venue.name,
              date: formatSessionDate(session.startsAt, theme.locale),
              time: formatSessionTime(session.startsAt, theme.locale),
            })}
          </Text>
          <Button label={t('common.done')} onPress={close} isFullWidth testID="booking-done" />
        </View>
      ) : lostTheSpot ? (
        <View style={{ gap: theme.spacing.md }} testID="booking-full">
          {/* 9.5: the losers of a race get session_full "which the UI must
              present gently". */}
          <Text variant="body">{t('payment.fullTitle')}</Text>
          <Button
            label={t('session.joinWaitlist')}
            onPress={joinWaitlist}
            isFullWidth
            testID="booking-join-waitlist"
          />
          <Button label={t('common.close')} onPress={close} variant="ghost" isFullWidth />
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <Card testID="booking-summary">
            <Text variant="heading">{session.venue.name}</Text>
            <Text variant="small" tone="secondary">
              {`${formatSessionDate(session.startsAt, theme.locale)} · ${formatSessionTime(
                session.startsAt,
                theme.locale,
              )}`}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: theme.spacing.sm,
              }}
            >
              <Text variant="small" tone="tertiary">
                {t('payment.amount')}
              </Text>
              <Text variant="heading" testID="booking-amount">
                {formatMoney(payableFils, theme.locale)}
              </Text>
            </View>
          </Card>

          <Text variant="heading">{t('payment.chooseMethod')}</Text>

          <View style={{ gap: theme.spacing.sm }} accessibilityRole="radiogroup">
            {PLAYER_PAYMENT_METHODS.map((option) => (
              <MethodOption
                key={option}
                method={option}
                isSelected={method === option}
                // 14.8: credit is the only option that is ever disabled, and
                // only when there is nothing to spend.
                isDisabled={option === 'credit' && !hasCredit}
                subtitle={subtitles[option]}
                onSelect={chooseMethod}
              />
            ))}
          </View>

          {/* 14.8's CliQ sub-flow, and 10.1 steps 2 to 4. */}
          {isCliq ? (
            <CliqPaymentStep payableFils={payableFils} proof={proof} onProofChange={setProof} />
          ) : null}

          {/* D53: one informational line, and nothing recorded anywhere. */}
          {method === 'credit' && session.sessionType === 'extended' ? (
            <Text variant="small" tone="secondary" testID="booking-extended-topup">
              {t('payment.extendedTopUp')}
            </Text>
          ) : null}

          {active.isError ? (
            <View style={{ gap: theme.spacing.sm }} testID="booking-error">
              {/* 10.1: "If the upload fails, no booking is created and the
                  player sees a retry option." The retry is the confirm button
                  below, unchanged and still holding his screenshot. */}
              <Chip label={t(bookingErrorMessageKey(active.error))} tone="danger" />
              <WhatsAppButton isFullWidth />
            </View>
          ) : null}

          <Button
            label={t('payment.confirm')}
            onPress={confirm}
            // 14.8: "The confirm button is disabled until an image is
            // attached." Only on the CliQ path; the other two are one tap.
            isDisabled={isCliq && proof === null}
            isLoading={active.isPending}
            isFullWidth
            testID="booking-confirm"
          />
        </View>
      )}
    </Sheet>
  );
};

export default BookingConfirmSheet;
