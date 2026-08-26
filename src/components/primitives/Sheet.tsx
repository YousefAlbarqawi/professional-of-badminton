/**
 * Bottom sheet. BUILD-SPEC 17.3.
 *
 * 14.8 is explicit that the booking confirmation is "a bottom sheet, not a
 * screen", which is what this exists for. It is a `Modal` for the same reason
 * `Dialog` is one: the stack in 14.0 lists a `BookingConfirm` route, but a
 * route cannot sit over the session detail it summarises, and 14.8's prose is
 * the more specific instruction.
 *
 * The handle, the backdrop and the Android back gesture all dismiss it. A
 * sheet that traps the player would be worse than one he closes by accident,
 * because everything in it is reversible and nothing in it is destructive.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface SheetProps {
  isVisible: boolean;
  /** Already translated. */
  title: string;
  onClose: () => void;
  /** Set while a mutation is in flight, so a stray tap cannot dismiss it. */
  isDismissDisabled?: boolean;
  children: React.ReactNode;
  testID?: string;
}

export const Sheet: React.FC<SheetProps> = ({
  isVisible,
  title,
  onClose,
  isDismissDisabled = false,
  children,
  testID = 'sheet',
}) => {
  const theme = useTheme();
  const dismiss = isDismissDisabled ? undefined : onClose;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Backdrop as a sibling, not a parent: wrapping the sheet in it would
            hide the whole sheet from assistive technology. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={title}
          disabled={isDismissDisabled}
        />

        <View
          testID={testID}
          accessibilityViewIsModal
          style={{
            backgroundColor: theme.colors.bgElevated,
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            borderTopLeftRadius: theme.radii.lg,
            borderTopRightRadius: theme.radii.lg,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.xl,
            gap: theme.spacing.md,
            maxHeight: '90%',
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.border,
            }}
          />

          <Text variant="heading">{title}</Text>

          <ScrollView
            contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.sm }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
});

export default Sheet;
