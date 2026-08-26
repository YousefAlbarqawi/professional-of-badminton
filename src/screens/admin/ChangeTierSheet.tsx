/**
 * "Change tier". BUILD-SPEC 15.2, closed alongside 15.8 section 2.
 *
 * One tap writes immediately — there is no separate save step, the same
 * "every edit writes immediately" rule 13.9 states for the court board. A
 * guest is never offered this: `RowActionsSheet` only shows the action for
 * `entry.kind === 'player'` (a guest has no profile row to change), and this
 * sheet's own `choose` refuses to run without a `playerId` as a second guard.
 */
import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TierPickerRow } from '@/components/domain';
import { Sheet, Text } from '@/components/primitives';
import { paymentErrorMessageKey } from '@/features/payments/errors';
import { useSetPlayerTier } from '@/features/payments/mutations';
import type { RosterEntry } from '@/features/bookings/types';
import type { Tier } from '@/lib/tiers';
import { useTheme } from '@/theme';

export interface ChangeTierSheetProps {
  entry: RosterEntry | null;
  onClose: () => void;
}

export const ChangeTierSheet: React.FC<ChangeTierSheetProps> = ({ entry, onClose }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const setTier = useSetPlayerTier();

  const close = useCallback((): void => {
    setTier.reset();
    onClose();
  }, [onClose, setTier]);

  const choose = useCallback(
    (tier: Tier | null): void => {
      if (entry === null || entry.playerId === null) return;
      setTier.mutate({ playerId: entry.playerId, tier }, { onSuccess: close });
    },
    [close, entry, setTier],
  );

  return (
    <Sheet
      isVisible={entry !== null}
      title={t('admin.manage.changeTierTitle', { name: entry?.displayName ?? '' })}
      onClose={close}
      isDismissDisabled={setTier.isPending}
      testID="change-tier-sheet"
    >
      <View style={{ gap: theme.spacing.md }}>
        <TierPickerRow
          value={entry?.tier ?? null}
          onChange={choose}
          isDisabled={setTier.isPending}
          testID="change-tier-picker"
        />

        {setTier.isError ? (
          <Text variant="small" tone="danger" testID="change-tier-error">
            {t(paymentErrorMessageKey(setTier.error))}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
};

export default ChangeTierSheet;
