/**
 * The error state. Retry plus WhatsApp, per the state table in BUILD-SPEC 14.6
 * and D72.
 *
 * Callers pass an already-translated message. Mapping a server error code from
 * Appendix A to its string key is the caller's job, because only the caller
 * knows which screen's copy applies.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { WhatsAppButton } from '@/components/primitives/WhatsAppButton';
import { useTheme } from '@/theme';
import { useTranslation } from 'react-i18next';

export interface ErrorStateProps {
  /** Already translated, for example `t('schedule.loadError')`. */
  message: string;
  title?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  showWhatsApp?: boolean;
  testID?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  message,
  title,
  onRetry,
  isRetrying = false,
  showWhatsApp = true,
  testID = 'error-state',
}) => {
  const theme = useTheme();
  const { t } = useTranslation();

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
      <Text variant="heading" align="center">
        {title ?? t('states.errorTitle')}
      </Text>

      <Text variant="body" tone="secondary" align="center">
        {message}
      </Text>

      {onRetry === undefined ? null : (
        <Button
          label={t('common.retry')}
          onPress={onRetry}
          variant="primary"
          isLoading={isRetrying}
          style={styles.button}
        />
      )}

      {showWhatsApp ? <WhatsAppButton variant="ghost" style={styles.button} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignSelf: 'center',
  },
});

export default ErrorState;
