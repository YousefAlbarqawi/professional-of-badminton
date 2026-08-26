/**
 * A label and a figure on one line, which is most of what a report is.
 *
 * `note` is 12.3's accrued marker and its relatives: a short line under the
 * figure explaining why it is not quite what it looks like. It renders as text
 * rather than as a colour, because nothing in this app is said by colour alone
 * (17.2).
 */
import React from 'react';
import { View } from 'react-native';

import { Text, type TextTone } from '@/components/primitives/Text';
import { useTheme } from '@/theme';

export interface ReportStatLineProps {
  /** Already translated. */
  label: string;
  /** Already formatted — money through `formatMoney`, counts as digits. */
  value: string;
  note?: string | undefined;
  tone?: TextTone | undefined;
  /** The headline of a section: bigger, and read first. */
  isEmphasised?: boolean | undefined;
  testID?: string | undefined;
}

export const ReportStatLine: React.FC<ReportStatLineProps> = ({
  label,
  value,
  note,
  tone = 'primary',
  isEmphasised = false,
  testID,
}) => {
  const theme = useTheme();

  return (
    <View style={{ gap: 2, paddingVertical: theme.spacing.xs / 2 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <Text variant={isEmphasised ? 'body' : 'small'} tone="secondary" style={{ flexShrink: 1 }}>
          {label}
        </Text>
        <Text
          variant={isEmphasised ? 'heading' : 'small'}
          weight={isEmphasised ? '700' : '600'}
          tone={tone}
          testID={testID}
        >
          {value}
        </Text>
      </View>

      {note === undefined ? null : (
        <Text variant="caption" tone="tertiary">
          {note}
        </Text>
      )}
    </View>
  );
};

export default ReportStatLine;
