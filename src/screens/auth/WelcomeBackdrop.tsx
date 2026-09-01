/**
 * The drifting shuttlecocks behind 14.1's welcome screen.
 *
 * Purely decorative. It sits under the content, never takes a touch, and is
 * hidden from assistive technology outright — there is nothing here a screen
 * reader should read, and the screen says everything it needs to in words.
 *
 * ── Why the shuttlecock is drawn rather than imported ─────
 * Ionicons is the app's icon set (`components/primitives/Icon.tsx`) and has no
 * badminton glyph — `tennisball` is as close as it gets, and a tennis ball on
 * a badminton academy's first screen is the wrong sport. The obvious fix,
 * `react-native-svg`, is a new dependency and BUILD-SPEC 2.1 does not list it.
 *
 * So `Shuttlecock` below is four `View`s: a ring for the cork and three strokes
 * fanned above it for the feathers. At the sizes and opacities used here that
 * reads unmistakably, matches the stroke weight of the outline Ionicons beside
 * it, and costs nothing at runtime. If 2.1 ever gains an SVG renderer this is
 * the first thing that should be replaced with real artwork.
 *
 * ── Motion ────────────────────────────────────────────────
 * Every piece drifts vertically and rocks a few degrees, on its own duration
 * and its own delay so nothing pulses in time with anything else — a grid of
 * synchronised icons reads as a loading screen, not as air. Each one owns its
 * shared value, which is why `FloatingPiece` is a component rather than a loop
 * inside this one: hooks cannot be called in a map.
 *
 * Reduce Motion stops all of it and renders the same arrangement still. The
 * decoration is composition first and movement second, so it loses nothing it
 * needed.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/primitives';
import { useTheme } from '@/theme';

interface Piece {
  /** `null` renders the drawn shuttlecock; anything else is an Ionicon. */
  icon: IconName | null;
  size: number;
  left: DimensionValue;
  top: DimensionValue;
  /** Held low — this is texture, not content. 17.1's contrast rules apply to
   *  text, and nothing here is text, but it must never compete with the two
   *  buttons that are the point of the screen. */
  opacity: number;
  /** Points travelled each way from the resting position. */
  drift: number;
  /** Degrees rocked each way. */
  rotate: number;
  durationMs: number;
  delayMs: number;
  /** True for the accent colour, false for a plain light grey. */
  isAccent: boolean;
}

/**
 * Placed by hand rather than generated, so the arrangement is the same on
 * every launch and can be judged as a composition. Percentages rather than
 * points: the same layout has to hold from an SE to a Pro Max.
 *
 * The middle of the screen is left comparatively empty — the logo, the
 * wordmark and the two buttons live there, and decoration behind a button is
 * decoration in the way.
 */
const PIECES: readonly Piece[] = [
  {
    icon: null,
    size: 46,
    left: '8%',
    top: '11%',
    opacity: 0.14,
    drift: 12,
    rotate: 8,
    durationMs: 5200,
    delayMs: 0,
    isAccent: true,
  },
  {
    icon: null,
    size: 30,
    left: '78%',
    top: '18%',
    opacity: 0.1,
    drift: 9,
    rotate: 10,
    durationMs: 4200,
    delayMs: 900,
    isAccent: false,
  },
  {
    icon: null,
    size: 38,
    left: '64%',
    top: '72%',
    opacity: 0.12,
    drift: 14,
    rotate: 7,
    durationMs: 6100,
    delayMs: 400,
    isAccent: true,
  },
  {
    icon: null,
    size: 24,
    left: '16%',
    top: '63%',
    opacity: 0.09,
    drift: 8,
    rotate: 12,
    durationMs: 4700,
    delayMs: 1500,
    isAccent: false,
  },

  {
    icon: 'tennisball-outline',
    size: 28,
    left: '86%',
    top: '44%',
    opacity: 0.1,
    drift: 10,
    rotate: 14,
    durationMs: 5600,
    delayMs: 300,
    isAccent: false,
  },
  {
    icon: 'trophy-outline',
    size: 26,
    left: '5%',
    top: '38%',
    opacity: 0.09,
    drift: 9,
    rotate: 9,
    durationMs: 5000,
    delayMs: 1200,
    isAccent: true,
  },
  {
    icon: 'medal-outline',
    size: 22,
    left: '30%',
    top: '8%',
    opacity: 0.08,
    drift: 7,
    rotate: 11,
    durationMs: 4400,
    delayMs: 700,
    isAccent: false,
  },
  {
    icon: 'people-outline',
    size: 25,
    left: '88%',
    top: '82%',
    opacity: 0.09,
    drift: 11,
    rotate: 8,
    durationMs: 5800,
    delayMs: 1800,
    isAccent: false,
  },
  {
    icon: 'calendar-outline',
    size: 21,
    left: '7%',
    top: '84%',
    opacity: 0.08,
    drift: 8,
    rotate: 10,
    durationMs: 4900,
    delayMs: 2100,
    isAccent: true,
  },
  {
    icon: 'stopwatch-outline',
    size: 20,
    left: '46%',
    top: '90%',
    opacity: 0.07,
    drift: 7,
    rotate: 12,
    durationMs: 5400,
    delayMs: 600,
    isAccent: false,
  },
  {
    icon: 'flame-outline',
    size: 19,
    left: '55%',
    top: '4%',
    opacity: 0.08,
    drift: 9,
    rotate: 13,
    durationMs: 4600,
    delayMs: 1400,
    isAccent: false,
  },
];

/** Feather angles, in degrees, fanning out from the cork. */
const FEATHER_ANGLES = [-24, 0, 24] as const;

interface ShuttlecockProps {
  size: number;
  color: string;
}

/**
 * A shuttlecock in four `View`s: a ring for the cork, three strokes for the
 * skirt. Every dimension is a fraction of `size`, so one number scales it.
 */
const Shuttlecock: React.FC<ShuttlecockProps> = ({ size, color }) => {
  const corkSize = size * 0.34;
  const featherLength = size * 0.62;
  const stroke = Math.max(1, size * 0.055);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
      {FEATHER_ANGLES.map((angle) => (
        <View
          key={angle}
          style={{
            position: 'absolute',
            bottom: corkSize * 0.7,
            width: stroke,
            height: featherLength,
            backgroundColor: color,
            borderRadius: stroke,
            // Rotated about the bottom edge, so all three fan from the cork
            // rather than from their own centres.
            transform: [
              { translateY: featherLength / 2 },
              { rotate: `${angle}deg` },
              { translateY: -featherLength / 2 },
            ],
          }}
        />
      ))}

      <View
        style={{
          width: corkSize,
          height: corkSize,
          borderRadius: corkSize / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
    </View>
  );
};

const FloatingPiece: React.FC<{ piece: Piece; isStill: boolean }> = ({ piece, isStill }) => {
  const theme = useTheme();
  const progress = useSharedValue(0);
  const color = piece.isAccent ? theme.colors.accent : theme.colors.textSecondary;

  useEffect(() => {
    if (isStill) return;

    progress.value = withDelay(
      piece.delayMs,
      withRepeat(
        withTiming(1, { duration: piece.durationMs, easing: Easing.inOut(Easing.sin) }),
        -1,
        // Reversed rather than restarted: a drift that snaps back to the top
        // reads as a glitch, and there is no seam to hide it behind.
        true,
      ),
    );
    // `progress` is stable for the life of this component and is deliberately
    // not a dependency — the same reasoning `CourtTile` and `AnimatedSplash`
    // give for their own shared values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStill, piece.delayMs, piece.durationMs]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [piece.drift, -piece.drift]) },
      { rotate: `${interpolate(progress.value, [0, 1], [-piece.rotate, piece.rotate])}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        { left: piece.left, top: piece.top, opacity: piece.opacity },
        animatedStyle,
      ]}
    >
      {piece.icon === null ? (
        <Shuttlecock size={piece.size} color={color} />
      ) : (
        <Icon name={piece.icon} size={piece.size} color={color} />
      )}
    </Animated.View>
  );
};

export const WelcomeBackdrop: React.FC = () => {
  const isReducedMotion = useReducedMotion();

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="welcome-backdrop"
    >
      {PIECES.map((piece, index) => (
        <FloatingPiece
          key={`${String(piece.icon)}-${index}`}
          piece={piece}
          isStill={isReducedMotion}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
  },
});

export default WelcomeBackdrop;
