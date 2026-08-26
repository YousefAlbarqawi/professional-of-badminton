/**
 * One of the nine sections of BUILD-SPEC 15.12. A titled card with a rule
 * under the heading, so a coach scrolling a month can find "Profit" without
 * reading the numbers on the way past.
 *
 * The heading carries an optional trailing element — a sort control, a chip —
 * because two of the nine sections need one and neither deserves its own
 * layout.
 */
import React from 'react';
import { View } from 'react-native';

import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';

export interface ReportSectionProps {
  /** Already translated. */
  title: string;
  subtitle?: string | undefined;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  testID?: string | undefined;
}

export const ReportSection: React.FC<ReportSectionProps> = ({
  title,
  subtitle,
  trailing,
  children,
  testID,
}) => {
  const theme = useTheme();

  return (
    <Card {...(testID === undefined ? {} : { testID })} style={{ gap: theme.spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <Text variant="heading" style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {trailing}
      </View>

      {subtitle === undefined ? null : (
        <Text variant="caption" tone="tertiary">
          {subtitle}
        </Text>
      )}

      <View
        style={{
          height: 1,
          backgroundColor: theme.colors.border,
          marginBottom: theme.spacing.xs,
        }}
      />

      {children}
    </Card>
  );
};

export default ReportSection;
