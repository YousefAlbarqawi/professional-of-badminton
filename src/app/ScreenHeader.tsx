/**
 * The stack header, drawn by React Native instead of by UIKit.
 *
 * ── Why this exists ──────────────────────────────────────
 * A control hosted inside the native `UINavigationBar` does not receive taps
 * when the layout direction is forced right to left. Found on an iPhone 11 on
 * iOS 17.7.2: the native back button, and a plain `Pressable` put in its
 * place, both drew correctly and both ignored every tap on either edge, while
 * the swipe-back gesture and the whole screen body kept working. Expo's own
 * dev-launcher — a second React root in the same binary — is dead the same
 * way, on an iOS 26 simulator too, which is what rules out this app's own
 * navigation code as the cause.
 *
 * The common factor is a React Native view hosted outside the main root view:
 * `forceRTL` mirrors the root, the secondary host is not mirrored with it, and
 * React Native then lays out where UIKit does not hit-test. Touches at the top
 * of the screen do reach the root view — the diagnostic responder confirmed
 * that — so a header rendered *in the screen's own tree*, as this one is, sits
 * in the hierarchy that works.
 *
 * The swipe gesture is untouched and still goes back; this restores the
 * affordance for the players who do not know the gesture, which is most.
 *
 * ── Why there is no title ────────────────────────────────
 * The bar carries the back control and nothing else, per the client. Screens
 * still set `options.title` — it names the route for the tab bar and for
 * accessibility — this header just does not draw it. The bar keeps its height
 * and safe-area padding either way, so no screen shifts when the control is
 * absent.
 */
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';

import { Icon } from '@/components/primitives';
import { MIN_TOUCH_TARGET, colors, spacing, useTheme } from '@/theme';

/** Matches the native bar this replaces, so no screen shifts under it. */
const BAR_HEIGHT = 44;

export interface ScreenHeaderProps extends NativeStackHeaderProps {
  /** Suppresses the back control on a screen that must not offer one. */
  hideBack?: boolean;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  navigation,
  back,
  hideBack = false,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const theme = useTheme();

  const handleBack = useCallback((): void => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {back === undefined || hideBack ? null : (
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.button}
            testID="screen-header-back"
          >
            {/* 16.2: a chevron points somewhere, so it mirrors. */}
            <Icon
              name={theme.isRTL ? 'chevron-forward' : 'chevron-back'}
              size={26}
              color={colors.textPrimary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bg,
  },
  row: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ScreenHeader;
