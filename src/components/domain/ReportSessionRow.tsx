/**
 * One row of BUILD-SPEC 15.12 section 4: "Date, venue, time, players, revenue,
 * cost, profit."
 *
 * A seven column table does not fit on a phone (D79 says there is no tablet
 * layout to fall back to), so the row is two lines: what and when on the
 * first, the money on the second. The three money figures keep a fixed order —
 * revenue, cost, profit — so the eye can run down a column that is not drawn.
 *
 * Profit is the one figure that can be negative, and a loss is written with
 * its minus sign as well as its colour (17.2).
 */
import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/primitives/Text';
import { formatMoney, type Fils } from '@/lib/money';
import { useTheme } from '@/theme';

export interface ReportSessionRowProps {
  /** Already translated and formatted, for example "2 July · 7:00 PM". */
  when: string;
  /** Venue name in the reading language. */
  venue: string;
  /** Already translated, for example "12 of 16". */
  players: string;
  revenueFils: Fils;
  costFils: Fils;
  profitFils: Fils;
  /** Already translated column labels, so the row never invents copy. */
  revenueLabel: string;
  costLabel: string;
  profitLabel: string;
  testID?: string | undefined;
}

interface FigureProps {
  label: string;
  amount: Fils;
  tone?: 'primary' | 'secondary' | 'accent' | 'danger' | undefined;
  testID?: string | undefined;
}

const Figure: React.FC<FigureProps> = ({ label, amount, tone = 'primary', testID }) => {
  const theme = useTheme();

  return (
    <View style={{ gap: 2, flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
      <Text variant="caption" tone="tertiary">
        {label}
      </Text>
      <Text variant="caption" weight="600" tone={tone} testID={testID}>
        {formatMoney(amount, theme.locale)}
      </Text>
    </View>
  );
};

export const ReportSessionRow: React.FC<ReportSessionRowProps> = ({
  when,
  venue,
  players,
  revenueFils,
  costFils,
  profitFils,
  revenueLabel,
  costLabel,
  profitLabel,
  testID,
}) => {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={{
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <Text variant="small" weight="600" style={{ flexShrink: 1 }}>
          {when}
        </Text>
        <Text variant="caption" tone="secondary">
          {players}
        </Text>
      </View>

      <Text variant="caption" tone="secondary">
        {venue}
      </Text>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Figure label={revenueLabel} amount={revenueFils} />
        <Figure label={costLabel} amount={costFils} tone="secondary" />
        <Figure
          label={profitLabel}
          amount={profitFils}
          tone={profitFils < 0 ? 'danger' : 'accent'}
          testID={testID === undefined ? undefined : `${testID}-profit`}
        />
      </View>
    </View>
  );
};

export default ReportSessionRow;
