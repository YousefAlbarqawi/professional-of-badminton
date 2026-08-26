/**
 * SegmentedControl. BUILD-SPEC 17.3.
 *
 * Two to four mutually exclusive options, all visible at once. Used for the
 * session duration (D5: 90 or 150, and nothing else) and the venue picker
 * (D1: two venues, and nothing else). Where a list could grow, use something
 * else.
 *
 * Each segment is its own 44pt touch target, per 17.4.
 */
import React, { useCallback } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface SegmentedOption<T extends string | number> {
  value: T;
  /** Already translated. */
  label: string;
  /** A quieter second line, for example a venue's area. */
  caption?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  /** Already translated. */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  isDisabled?: boolean;
  testID?: string | undefined;
  style?: StyleProp<ViewStyle>;
}

interface SegmentProps<T extends string | number> {
  option: SegmentedOption<T>;
  isSelected: boolean;
  isDisabled: boolean;
  onChange: (value: T) => void;
  testID?: string | undefined;
}

function Segment<T extends string | number>({
  option,
  isSelected,
  isDisabled,
  onChange,
  testID,
}: SegmentProps<T>): React.ReactElement {
  const theme = useTheme();

  const handlePress = useCallback((): void => {
    if (isDisabled) return;
    onChange(option.value);
  }, [isDisabled, onChange, option.value]);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={option.label}
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={handlePress}
      style={{
        flex: 1,
        minHeight: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.sm,
        backgroundColor: isSelected ? theme.colors.accent : 'transparent',
      }}
    >
      <Text
        variant="small"
        weight="600"
        align="center"
        style={{ color: isSelected ? theme.colors.accentText : theme.colors.textSecondary }}
      >
        {option.label}
      </Text>
      {option.caption === undefined ? null : (
        <Text
          variant="caption"
          align="center"
          style={{ color: isSelected ? theme.colors.accentText : theme.colors.textTertiary }}
        >
          {option.caption}
        </Text>
      )}
    </Pressable>
  );
}

export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  isDisabled = false,
  testID,
  style,
}: SegmentedControlProps<T>): React.ReactElement {
  const theme = useTheme();

  return (
    <View style={[{ gap: theme.spacing.xs }, style]}>
      <Text variant="small" tone="secondary">
        {label}
      </Text>
      <View
        testID={testID}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{
          flexDirection: 'row',
          gap: theme.spacing.xs,
          padding: theme.spacing.xs,
          borderRadius: theme.radii.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.bgElevated,
          opacity: isDisabled ? 0.45 : 1,
        }}
      >
        {options.map((option) => (
          <Segment
            key={String(option.value)}
            option={option}
            isSelected={option.value === value}
            isDisabled={isDisabled}
            onChange={onChange}
            testID={testID === undefined ? undefined : `${testID}-${String(option.value)}`}
          />
        ))}
      </View>
    </View>
  );
}

export default SegmentedControl;
