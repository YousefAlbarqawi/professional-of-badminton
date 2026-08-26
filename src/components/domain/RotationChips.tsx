/**
 * The rotation selector at the top of the court board. BUILD-SPEC 13.10:
 * "Rotation selector at the top: chips 1 through N, current one highlighted,
 * swipeable."
 *
 * Swipeable is a horizontal scroll rather than a pager: with four to seven
 * chips there is rarely anything to scroll to on a phone, and a scroll view
 * degrades to a plain row when they all fit, where a pager would not.
 *
 * The chip is built here rather than from `components/primitives/Chip`,
 * because that one is a 12pt label and is not pressable. This is a control on
 * the one screen 13.10 sizes for arm's length, so it carries an 18pt label and
 * 17.4's 44pt touch target.
 *
 * The row runs left to right in Arabic as well. 16.2 exempts the court board
 * from mirroring because it maps to the physical hall, and the rotations are
 * the order of that hall's evening.
 */
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/primitives';
import { boardRowDirection } from '@/features/matchmaking/boardLayout';
import { useTheme } from '@/theme';

export interface RotationChipsProps {
  /** 1-based rotation indexes, in order. */
  indexes: readonly number[];
  currentIndex: number;
  onSelect: (index: number) => void;
  testID?: string;
}

export const RotationChips: React.FC<RotationChipsProps> = ({
  indexes,
  currentIndex,
  onSelect,
  testID = 'rotation-chips',
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: theme.spacing.xs }}
    >
      <View style={{ flexDirection: boardRowDirection(theme.isRTL), gap: theme.spacing.sm }}>
        {indexes.map((index) => {
          const isCurrent = index === currentIndex;
          return (
            <Pressable
              key={index}
              testID={`rotation-chip-${index}`}
              onPress={() => onSelect(index)}
              accessibilityRole="tab"
              accessibilityLabel={t('admin.board.rotation', { number: index })}
              accessibilityState={{ selected: isCurrent }}
              style={{
                minWidth: theme.minTouchTarget,
                minHeight: theme.minTouchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radii.pill,
                backgroundColor: isCurrent ? theme.colors.accent : theme.colors.bgSurface,
              }}
            >
              <Text
                variant="heading"
                weight="700"
                style={{ color: isCurrent ? theme.colors.accentText : theme.colors.textSecondary }}
              >
                {t('admin.board.rotationShort', { number: index })}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
};

export default RotationChips;
