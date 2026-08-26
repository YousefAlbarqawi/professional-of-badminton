/**
 * One movement in the credit ledger. BUILD-SPEC 14.13, D56.
 *
 * "Below, a History list of every credit transaction with reason and date, so
 * a player can see exactly where his credits went."
 *
 * D56 makes the reason mandatory on every movement, so it is the largest thing
 * on the row. The signed delta is written with its sign — `+40`, `−13` — rather
 * than as a colour or an arrow, because the whole point of 11.3's migration
 * flow is that the coach can read the history back and have it explain itself.
 * The minus is U+2212, not a hyphen, so it is not mistaken for punctuation and
 * does not get reordered by the bidi algorithm in Arabic.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/primitives';
import { reasonLabelKey } from '@/features/subscriptions/creditLedger';
import type { CreditReason } from '@/features/subscriptions/types';
import { formatSessionDate, parseInstant } from '@/lib/time';
import { useTheme } from '@/theme';

export interface CreditHistoryRowProps {
  delta: number;
  reason: CreditReason;
  /** 11.3's "used before the app", and every other explanation. */
  note: string | null;
  /** A `timestamptz`. */
  createdAt: string;
  /** Which subscription it moved, when more than one is on screen. */
  subscriptionLabel?: string | undefined;
  testID?: string | undefined;
}

const MINUS = '−';

export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${MINUS}${Math.abs(delta)}`;
}

export const CreditHistoryRow: React.FC<CreditHistoryRowProps> = ({
  delta,
  reason,
  note,
  createdAt,
  subscriptionLabel,
  testID,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small">{t(reasonLabelKey(reason))}</Text>
        <Text variant="caption" tone="tertiary">
          {formatSessionDate(parseInstant(createdAt), theme.locale)}
        </Text>
        {subscriptionLabel === undefined ? null : (
          <Text variant="caption" tone="tertiary">
            {subscriptionLabel}
          </Text>
        )}
        {note === null || note === '' ? null : (
          <Text variant="caption" tone="secondary">
            {note}
          </Text>
        )}
      </View>

      <Text
        variant="body"
        weight="600"
        tone={delta > 0 ? 'accent' : 'secondary'}
        testID={testID === undefined ? undefined : `${testID}-delta`}
      >
        {formatDelta(delta)}
      </Text>
    </View>
  );
};

export default CreditHistoryRow;
