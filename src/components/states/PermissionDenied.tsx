/**
 * The permission denied state. BUILD-SPEC 2.2 names it; 15.12 is where it is
 * finally used: "An admin opening this tab sees a permission denied state, and
 * the API refuses the query as well."
 *
 * It says who may see the thing rather than that something went wrong, because
 * nothing did. An admin has every other power the coach has (D16) and is not
 * being told off. The WhatsApp affordance stays, per D72.
 */
import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/primitives/Text';
import { WhatsAppButton } from '@/components/primitives/WhatsAppButton';
import { useTheme } from '@/theme';

export interface PermissionDeniedProps {
  /** Already translated. */
  title: string;
  message: string;
  showWhatsApp?: boolean | undefined;
  testID?: string | undefined;
}

export const PermissionDenied: React.FC<PermissionDeniedProps> = ({
  title,
  message,
  showWhatsApp = true,
  testID = 'permission-denied',
}) => {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.xl,
        paddingHorizontal: theme.spacing.lg,
        gap: theme.spacing.md,
      }}
    >
      <Text variant="heading" align="center">
        {title}
      </Text>

      <Text variant="body" tone="secondary" align="center">
        {message}
      </Text>

      {showWhatsApp ? <WhatsAppButton variant="ghost" /> : null}
    </View>
  );
};

export default PermissionDenied;
