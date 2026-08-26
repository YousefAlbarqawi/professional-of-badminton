/**
 * One player on the court board. BUILD-SPEC 13.10.
 *
 * "Each tile: first name in large bold text, family name smaller, tier badge
 * in the corner. Minimum font size for player names: 18pt. No truncation
 * below 12 characters; wrap instead."
 *
 * Nothing here truncates at all. The coach reads this aloud across a gym, and
 * a name he has to guess at is worse than a card one line taller, so both
 * lines wrap and neither carries `numberOfLines`. Both are at or above 18pt:
 * `courtName` is 20 and `heading` is 18, which keeps the family name smaller
 * than the first without dropping under the floor 13.10 sets.
 *
 * Two ways to move a player, and 13.9 requires both. The pan gesture is the
 * drag; the press is one half of tap-to-swap, "required as an accessible
 * alternative to dragging on a small phone". A tile on a locked court does
 * neither, and says why through its accessibility hint rather than by looking
 * inert.
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text } from '@/components/primitives';
import type { BoardPlayer } from '@/features/matchmaking/boardTypes';
import { useTheme } from '@/theme';

import { TierBadge } from './TierBadge';

export interface CourtTileProps {
  player: BoardPlayer;
  /** Tapped once, waiting for the second tap. 13.9. */
  isSelected: boolean;
  /** The court this tile sits on is locked, so it cannot move. 13.9. */
  isLocked: boolean;
  /** Already translated. Read out for the tile and used as the press label. */
  accessibilityLabel: string;
  onPress: () => void;
  /** The board measures every tile when a drag begins. */
  onDragStart: () => void;
  /** Window coordinates of the release point, for the board to hit test. */
  onDrop: (x: number, y: number) => void;
  registerNode: (node: View | null) => void;
  testID?: string;
}

/** Long enough that a scroll is not mistaken for a drag, short enough to feel direct. */
const DRAG_HOLD_MS = 180;

export const CourtTile: React.FC<CourtTileProps> = ({
  player,
  isSelected,
  isLocked,
  accessibilityLabel,
  onPress,
  onDragStart,
  onDrop,
  registerNode,
  testID,
}) => {
  const theme = useTheme();
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isLocked)
        .activateAfterLongPress(DRAG_HOLD_MS)
        .onStart(() => {
          isDragging.value = true;
          onDragStart();
        })
        .onUpdate((event) => {
          offsetX.value = event.translationX;
          offsetY.value = event.translationY;
        })
        .onEnd((event) => {
          onDrop(event.absoluteX, event.absoluteY);
        })
        .onFinalize(() => {
          isDragging.value = false;
          offsetX.value = withSpring(0);
          offsetY.value = withSpring(0);
        })
        .runOnJS(true),
    // The three shared values are stable for the life of the component and
    // are deliberately not dependencies: listing them would tell the compiler
    // this memo may modify a value another hook was handed, which is exactly
    // what a shared value is for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLocked, onDragStart, onDrop],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }],
    zIndex: isDragging.value ? 2 : 0,
    opacity: isDragging.value ? 0.9 : 1,
  }));

  const handleRef = useCallback((node: View | null): void => registerNode(node), [registerNode]);

  const surface: ViewStyle = {
    flex: 1,
    minHeight: theme.minTouchTarget * 1.5,
    justifyContent: 'center',
    gap: 2,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.bgSurface,
    borderWidth: 2,
    borderColor: isSelected ? theme.colors.accent : 'transparent',
  };

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1 }, animatedStyle]}>
        <Pressable
          ref={handleRef}
          testID={testID}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ selected: isSelected, disabled: isLocked }}
          style={surface}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.xs }}>
            <View style={{ flex: 1 }}>
              <Text variant="courtName" weight="700">
                {player.firstName}
              </Text>
              {player.familyName.length > 0 ? (
                <Text variant="heading" tone="secondary" weight="400">
                  {player.familyName}
                </Text>
              ) : null}
            </View>
            <TierBadge tier={player.tier} testID={testID ? `${testID}-tier` : undefined} />
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
};

export default CourtTile;
