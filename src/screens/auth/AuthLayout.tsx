/**
 * The frame every auth screen sits in.
 *
 * Forms on a phone are mostly a keyboard problem: five fields and a submit
 * button do not fit above an open keyboard, so the content scrolls and the
 * button stays reachable rather than being pushed off the bottom.
 */
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/primitives';
import { useTheme } from '@/theme';

export interface AuthLayoutProps {
  /** Already translated. */
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned under the scrolling content, for a "no account yet?" line. */
  footer?: React.ReactNode;
  testID?: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  subtitle,
  children,
  footer,
  testID,
}) => {
  const theme = useTheme();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        testID={testID}
        style={styles.flex}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="title">{title}</Text>
          {subtitle === undefined ? null : (
            <Text variant="body" tone="secondary">
              {subtitle}
            </Text>
          )}
        </View>

        <View style={{ gap: theme.spacing.md }}>{children}</View>

        {footer === undefined ? null : (
          <View style={[styles.footer, { gap: theme.spacing.sm }]}>{footer}</View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
  },
});

export default AuthLayout;
