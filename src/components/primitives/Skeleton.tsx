/**
 * Skeleton. BUILD-SPEC 17.4: no spinner longer than 400ms without a skeleton,
 * and 14.6 asks for three skeleton cards rather than a spinner while the
 * schedule loads.
 *
 * The pulse is driven by the native driver so it costs nothing on the JS
 * thread, and it respects the platform's reduce-motion setting by holding
 * still instead.
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface SkeletonProps {
  width?: ViewStyle['width'];
  height?: number;
  /** Defaults to the small radius; pass `pill` for avatars and chips. */
  radius?: 'sm' | 'md' | 'lg' | 'pill';
  testID?: string;
  style?: ViewStyle;
}

const PULSE_DURATION_MS = 900;

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  radius = 'sm',
  testID,
  style,
}) => {
  const theme = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.4));
  const [isReduceMotionEnabled, setIsReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (isMounted) setIsReduceMotionEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setIsReduceMotionEnabled,
    );
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (isReduceMotionEnabled) {
      opacity.setValue(0.6);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: PULSE_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isReduceMotionEnabled, opacity]);

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          opacity,
          backgroundColor: theme.colors.bgSurface,
          borderRadius: theme.radii[radius],
        },
        style,
      ]}
    />
  );
};

/** Three stacked lines, the shape a loading list row takes. */
export const SkeletonCard: React.FC<{ testID?: string }> = ({ testID }) => {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: theme.colors.bgElevated,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
      }}
    >
      <Skeleton width="60%" height={20} />
      <Skeleton width="40%" height={14} />
      <Skeleton width="100%" height={8} radius="pill" />
    </View>
  );
};

export default Skeleton;
