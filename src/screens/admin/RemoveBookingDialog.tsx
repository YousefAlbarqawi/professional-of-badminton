/**
 * Removing somebody from a session, and the credit return prompt behind it.
 * BUILD-SPEC 15.2, 8.3, 9.3, D26.
 *
 * Two dialogs in one, because the question depends on how he paid:
 *
 *   cash, CliQ, free   one confirmation. Nothing to return: 9.3 says a
 *                      cancellation writes no balance entry and the app records
 *                      nothing about CliQ.
 *   credit             the prompt. D26 consumes the credit inside three hours
 *                      and D25 returns it outside, and 8.3 lets the coach
 *                      override either way "because the coach is allowed to
 *                      make exceptions".
 *
 * The default offered is the rule, not the exception: the button that matches
 * `admin_remove_booking`'s own default is the primary one, and the other is
 * there because the coach knows something the rule does not.
 */
import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, Text } from '@/components/primitives';
import { bookingErrorMessageKey } from '@/features/bookings/errors';
import { useRemoveBooking } from '@/features/bookings/mutations';
import type { RosterEntry } from '@/features/bookings/types';
import { isWithinCancellationWindow } from '@/lib/time';
import { useTheme } from '@/theme';

export interface RemoveBookingDialogProps {
  entry: RosterEntry | null;
  sessionId: string;
  sessionStartsAt: Date;
  now: Date;
  onClose: () => void;
}

export const RemoveBookingDialog: React.FC<RemoveBookingDialogProps> = ({
  entry,
  sessionId,
  sessionStartsAt,
  now,
  onClose,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const removeBooking = useRemoveBooking();

  const isCredit = entry?.paymentMethod === 'credit';
  // 8.3's default: false inside the 3 hour window, true outside it.
  const defaultReturn = isWithinCancellationWindow(sessionStartsAt, now);

  const close = useCallback((): void => {
    removeBooking.reset();
    onClose();
  }, [onClose, removeBooking]);

  const remove = useCallback(
    (returnCredit: boolean | null): void => {
      if (entry === null) return;
      removeBooking.mutate(
        { bookingId: entry.bookingId, sessionId, returnCredit },
        { onSuccess: close },
      );
    },
    [close, entry, removeBooking, sessionId],
  );

  const removeReturning = useCallback((): void => remove(true), [remove]);
  const removeKeeping = useCallback((): void => remove(false), [remove]);
  // Not a credit booking: let the server apply its own default, since there is
  // nothing for it to apply the default to.
  const removePlain = useCallback((): void => remove(null), [remove]);

  const name = entry?.displayName ?? '';

  const errorLine = removeBooking.isError ? (
    <Text variant="small" tone="danger" testID="remove-error">
      {t(bookingErrorMessageKey(removeBooking.error))}
    </Text>
  ) : null;

  if (isCredit) {
    return (
      <Dialog
        isVisible={entry !== null}
        title={t('admin.manage.removeCreditTitle')}
        message={t('admin.manage.removeCreditBody', { name })}
        // The rule's answer is the confirm button; the exception is beside it.
        confirmLabel={
          defaultReturn ? t('admin.manage.removeCreditReturn') : t('admin.manage.removeCreditKeep')
        }
        cancelLabel={t('common.cancel')}
        onConfirm={defaultReturn ? removeReturning : removeKeeping}
        onCancel={close}
        isConfirming={removeBooking.isPending}
        isDestructive
        testID="remove-credit-dialog"
      >
        <View style={{ gap: theme.spacing.sm }}>
          <Button
            label={
              defaultReturn
                ? t('admin.manage.removeCreditKeep')
                : t('admin.manage.removeCreditReturn')
            }
            onPress={defaultReturn ? removeKeeping : removeReturning}
            variant="secondary"
            isFullWidth
            testID="remove-credit-alternative"
          />
          {errorLine}
        </View>
      </Dialog>
    );
  }

  return (
    <Dialog
      isVisible={entry !== null}
      title={t('admin.manage.removeTitle', { name })}
      message={t('admin.manage.removeBody')}
      confirmLabel={t('admin.manage.removeConfirm')}
      cancelLabel={t('common.cancel')}
      onConfirm={removePlain}
      onCancel={close}
      isConfirming={removeBooking.isPending}
      isDestructive
      testID="remove-dialog"
    >
      {errorLine}
    </Dialog>
  );
};

export default RemoveBookingDialog;
