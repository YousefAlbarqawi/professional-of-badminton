/**
 * Dialog. BUILD-SPEC 17.3 and 17.4: "dialogs for failure that needs a
 * decision", and "every destructive action confirms".
 *
 * A modal rather than `Alert`, because 14.14 needs the player to type a word
 * into the confirmation and `Alert.prompt` exists only on iOS.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

export interface DialogProps {
  isVisible: boolean;
  /** Already translated. */
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirmDisabled?: boolean;
  isConfirming?: boolean;
  /** Destructive confirms are red. 17.4. */
  isDestructive?: boolean;
  /** A field or a warning between the message and the buttons. */
  children?: React.ReactNode;
  testID?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  isVisible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  isConfirmDisabled = false,
  isConfirming = false,
  isDestructive = false,
  children,
  testID = 'dialog',
}) => {
  const theme = useTheme();

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      // Android's back gesture must do what Cancel does, not nothing.
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      {/* The backdrop is a sibling of the card, not its parent. Wrapping the
          card in it would put the whole dialog inside an element that is
          hidden from assistive technology. */}
      <View style={styles.centre}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        />

        <View
          testID={testID}
          accessibilityViewIsModal
          style={{
            backgroundColor: theme.colors.bgElevated,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            width: '100%',
            maxWidth: 420,
          }}
        >
          <Text variant="heading">{title}</Text>

          {message === undefined ? null : (
            <Text variant="body" tone="secondary">
              {message}
            </Text>
          )}

          {children}

          <View style={[styles.actions, { gap: theme.spacing.sm }]}>
            <Button label={cancelLabel} onPress={onCancel} variant="ghost" />
            <Button
              label={confirmLabel}
              onPress={onConfirm}
              variant={isDestructive ? 'destructive' : 'primary'}
              isDisabled={isConfirmDisabled}
              isLoading={isConfirming}
              testID={`${testID}-confirm`}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});

export default Dialog;
