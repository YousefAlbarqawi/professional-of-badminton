/**
 * The players tab row menu. BUILD-SPEC 15.2.
 *
 * "Swipe or long press a row for Remove, Change tier, Move to another
 * session." The row gesture is a tap, per `SessionManageScreen`'s own note on
 * why — a screen reader has no swipe or long press. What used to be a tap
 * straight into `RemoveBookingDialog` now opens this menu first, because
 * there are two destinations instead of one.
 *
 * *Change tier* opens 15.8 section 2's picker (`ChangeTierSheet`), one tap and
 * done. *Move to another session* and *Change tier* both only make sense for
 * a registered player: a guest is never remembered (D46) and a coach's slot
 * is tied to the night's fee split (`session_coaches`), so both are offered
 * only when `entry.kind === 'player'`.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Sheet } from '@/components/primitives';
import type { RosterEntry } from '@/features/bookings/types';
import { useTheme } from '@/theme';

export interface RowActionsSheetProps {
  entry: RosterEntry | null;
  onClose: () => void;
  onSelectMove: () => void;
  onSelectChangeTier: () => void;
  onSelectRemove: () => void;
}

export const RowActionsSheet: React.FC<RowActionsSheetProps> = ({
  entry,
  onClose,
  onSelectMove,
  onSelectChangeTier,
  onSelectRemove,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Sheet
      isVisible={entry !== null}
      title={entry?.displayName ?? ''}
      onClose={onClose}
      testID="row-actions-sheet"
    >
      <View style={{ gap: theme.spacing.sm }}>
        {entry?.kind !== 'player' ? null : (
          <>
            <Button
              label={t('admin.manage.changeTierAction')}
              onPress={onSelectChangeTier}
              variant="secondary"
              isFullWidth
              testID="row-action-change-tier"
            />
            <Button
              label={t('admin.manage.moveAction')}
              onPress={onSelectMove}
              variant="secondary"
              isFullWidth
              testID="row-action-move"
            />
          </>
        )}
        <Button
          label={t('admin.manage.removeAction')}
          onPress={onSelectRemove}
          variant="secondary"
          isFullWidth
          testID="row-action-remove"
        />
      </View>
    </Sheet>
  );
};

export default RowActionsSheet;
