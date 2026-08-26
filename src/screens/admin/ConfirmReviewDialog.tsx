/**
 * The confirmation behind 10.2's *Confirm session* and 8.5's reopen.
 *
 * 17.4: "Every destructive action confirms, except undoable ones." Confirming
 * a review is not destructive and it is undoable for seven days — but it does
 * settle every row at once, and the coach should see what he is about to
 * settle and what is still outstanding before he does. D39 gives him the seven
 * days; this gives him the number.
 *
 * Reopening is the reverse and says so plainly: the rows go back to
 * unreviewed, which is the state he is asking for.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, Text } from '@/components/primitives';
import { formatMoney, type Fils } from '@/lib/money';
import { useTheme } from '@/theme';

export interface ConfirmReviewDialogProps {
  mode: 'confirm' | 'reopen' | null;
  unsettledCount: number;
  outstandingFils: Fils;
  isRunning: boolean;
  /** Already a key, not a message. Null when nothing has failed. */
  errorKey: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmReviewDialog: React.FC<ConfirmReviewDialogProps> = ({
  mode,
  unsettledCount,
  outstandingFils,
  isRunning,
  errorKey,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const isReopen = mode === 'reopen';

  return (
    <Dialog
      isVisible={mode !== null}
      title={isReopen ? t('admin.money.reopenTitle') : t('admin.money.confirmTitle')}
      message={
        isReopen
          ? t('admin.money.reopenBody')
          : t('admin.money.confirmBody', { count: unsettledCount })
      }
      confirmLabel={isReopen ? t('admin.money.reopen') : t('admin.money.confirmSession')}
      cancelLabel={t('common.cancel')}
      onConfirm={onConfirm}
      onCancel={onCancel}
      isConfirming={isRunning}
      testID="review-dialog"
    >
      {!isReopen && outstandingFils > 0 ? (
        // D40: a balance is a record, not a gate. Confirming with money still
        // owed is a normal thing to do, so this is a note and not a warning
        // that blocks him.
        <Text variant="small" tone="secondary" testID="review-dialog-outstanding">
          {t('admin.money.confirmOutstanding', {
            amount: formatMoney(outstandingFils, theme.locale),
          })}
        </Text>
      ) : null}

      {errorKey === null ? null : (
        <Text variant="small" tone="danger" testID="review-dialog-error">
          {t(errorKey)}
        </Text>
      )}
    </Dialog>
  );
};

export default ConfirmReviewDialog;
