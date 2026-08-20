/**
 * The empty state. Every list has one, and every one of them carries the
 * WhatsApp affordance. D72.
 */
import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/primitives/Text';
import { WhatsAppButton } from '@/components/primitives/WhatsAppButton';
import { Button } from '@/components/primitives/Button';
import { useTheme } from '@/theme';

export interface EmptyStateProps {
  /** Already translated. Callers pass `t('schedule.empty')`, not the key. */
  message: string;
  title?: string;
  /** An optional way forward, for example "See the schedule". */
  actionLabel?: string;
  onAction?: () => void;
  /** D72 allows the rare screen with no WhatsApp button, such as Welcome. */
  showWhatsApp?: boolean;
  testID?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  title,
  actionLabel,
  onAction,
  showWhatsApp = true,
  testID = 'empty-state',
}) => {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.xl,
        paddingHorizontal: theme.spacing.lg,
        gap: theme.spacing.md,
      }}
    >
      {title === undefined ? null : (
        <Text variant="heading" align="center">
          {title}
        </Text>
      )}

      <Text variant="body" tone="secondary" align="center">
        {message}
      </Text>

      {actionLabel !== undefined && onAction !== undefined ? (
        <Button label={actionLabel} onPress={onAction} variant="primary" />
      ) : null}

      {showWhatsApp ? <WhatsAppButton variant="ghost" /> : null}
    </View>
  );
};

export default EmptyState;
