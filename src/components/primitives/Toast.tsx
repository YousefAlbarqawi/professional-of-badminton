/**
 * Toast. BUILD-SPEC 17.3 and 17.4: "Toasts for success, dialogs for failure
 * that needs a decision, inline text for validation."
 *
 * Controlled, and deliberately not a global imperative queue. The two callers
 * 13.9 asks for both own a piece of state the toast belongs to — the swap that
 * was refused, and the swap that can still be undone — and a component that
 * takes them as props is one a test can drive without a provider.
 *
 * It dismisses itself after `durationMs`. 13.9 sets that at ten seconds for
 * the undo; anything without an action gets the shorter default, because a
 * message with nothing to press does not need to be reachable, only read.
 */
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface ToastProps {
  isVisible: boolean;
  /** Already translated. */
  message: string;
  /** Already translated. Renders the action only when both are given. */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  durationMs?: number;
  tone?: 'neutral' | 'danger';
  testID?: string;
}

const DEFAULT_DURATION_MS = 4000;

export const Toast: React.FC<ToastProps> = ({
  isVisible,
  message,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = DEFAULT_DURATION_MS,
  tone = 'neutral',
  testID = 'toast',
}) => {
  const theme = useTheme();

  useEffect(() => {
    if (!isVisible) return undefined;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
    // `message` is in the list so that a second toast restarts the clock
    // rather than inheriting what was left of the first one's.
  }, [isVisible, message, durationMs, onDismiss]);

  if (!isVisible) return null;

  const hasAction = actionLabel !== undefined && onAction !== undefined;

  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        start: theme.spacing.md,
        end: theme.spacing.md,
        bottom: theme.spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: tone === 'danger' ? theme.colors.danger : theme.colors.border,
        backgroundColor: theme.colors.bgSurface,
      }}
    >
      <Text variant="small" style={{ flex: 1 }}>
        {message}
      </Text>
      {hasAction ? (
        <Pressable
          testID={`${testID}-action`}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={{
            minHeight: theme.minTouchTarget,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.sm,
          }}
        >
          <Text variant="small" tone="accent" weight="700">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

export default Toast;
