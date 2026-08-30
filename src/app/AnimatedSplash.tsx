/**
 * The animated hand-off from the native splash screen to the app.
 *
 * `expo-splash-screen` draws a still image and then vanishes. This draws the
 * same image, on the same background, in the same place — so the seam is
 * invisible — gives it one short movement, and fades itself out.
 *
 * Deliberately small: a spring on the scale and a fade on the opacity, held
 * briefly, then the whole overlay fades. No sequenced choreography, no
 * bouncing shuttlecock, nothing that a player waiting to book a court on a
 * slow connection has to sit through twice. The total is under a second, and
 * the app beneath is already mounted and interactive the moment the overlay's
 * opacity reaches zero — this never gates the first screen, it only covers it.
 *
 * Reduce Motion is honoured: with it on, the logo does not move at all and
 * only the fades run, which is the accommodation the setting is asking for.
 * With it on the hold is also shorter, because a motionless splash has nothing
 * left to show.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme';

/** The same file the native splash draws, so the two frames line up exactly. */
const LOGO = require('../../assets/splash-icon.png') as number;

/** Matches `imageWidth` in the expo-splash-screen plugin config. */
const LOGO_SIZE = 200;

const LOGO_FADE_MS = 420;
const HOLD_MS = 520;
const REDUCED_HOLD_MS = 220;
const OVERLAY_FADE_MS = 320;

export interface AnimatedSplashProps {
  /** Called once the overlay has finished fading, so it can be unmounted. */
  onFinish: () => void;
}

export const AnimatedSplash: React.FC<AnimatedSplashProps> = ({ onFinish }) => {
  const isReducedMotion = useReducedMotion();

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(isReducedMotion ? 1 : 0.84);
  const overlayOpacity = useSharedValue(1);

  const finish = useCallback((): void => onFinish(), [onFinish]);

  useEffect(() => {
    logoOpacity.value = withTiming(1, {
      duration: LOGO_FADE_MS,
      easing: Easing.out(Easing.quad),
    });

    if (!isReducedMotion) {
      // Slightly under-damped, so it settles with one small overshoot rather
      // than easing to a stop. That overshoot is the whole animation.
      logoScale.value = withSpring(1, { damping: 12, stiffness: 130, mass: 0.9 });
    }

    overlayOpacity.value = withDelay(
      (isReducedMotion ? REDUCED_HOLD_MS : HOLD_MS) + LOGO_FADE_MS,
      withTiming(0, { duration: OVERLAY_FADE_MS, easing: Easing.in(Easing.quad) }, (completed) => {
        'worklet';
        // An interrupted fade — the component unmounting under it — must not
        // report a finish that never happened.
        if (completed === true) runOnJS(finish)();
      }),
    );
    // The three shared values are stable for the life of this component and
    // are deliberately not dependencies, the same reasoning `CourtTile`'s pan
    // gesture and `ProofViewer`'s pinch give.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish, isReducedMotion]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  return (
    // Never intercepts a touch: the tree underneath is live throughout, and a
    // player who taps where a button is about to be should reach it.
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}
      pointerEvents="none"
      // One decorative image of a logo the player is looking at anyway. There
      // is nothing here for a screen reader to say that the app behind it does
      // not say better.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="animated-splash"
    >
      <Animated.View style={logoStyle}>
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      </Animated.View>
    </Animated.View>
  );
};

/**
 * The overlay plus the state that retires it. Mount this once, at the root:
 * it renders nothing at all after the animation has run, so the tree it sits
 * over pays for it exactly once per launch.
 */
export const AnimatedSplashHost: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);
  const hide = useCallback((): void => setIsVisible(false), []);

  if (!isVisible) return null;
  return <AnimatedSplash onFinish={hide} />;
};

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});

export default AnimatedSplashHost;
