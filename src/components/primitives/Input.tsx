/**
 * Input. BUILD-SPEC 17.3, 17.4 and 16.2.
 *
 * Validation is inline text under the field, never a dialog and never a toast.
 * An email address or a phone number is forced left to right whatever the app
 * language is, because a `+962` reads as nonsense when the paragraph around it
 * runs the other way.
 *
 * ── Where the caret starts ────────────────────────────────
 * The field's own `textAlign` is always set, never left at RN's default.
 * UIKit's `NSTextAlignmentNatural` — which is what an unset `textAlign`
 * becomes — resolves against the *device's* preferred language, not the app's
 * chosen one, so an Arabic install on an English phone put the caret at the
 * left edge of every field.
 *
 * The value is `theme.inputAlignStart` and **not** `theme.alignStart`, and the
 * difference is not cosmetic. React Native mirrors a literal `'left'`/`'right'`
 * on a `<Text>` under an RTL layout; it does not do the same for a
 * `<TextInput>`, which takes the value physically. `alignStart` compensates
 * for that mirroring, so handing it to a field applies the correction twice
 * and lands on the wrong edge — Arabic typing from the left and English from
 * the right, both wrong at once, which is exactly what was reported. See the
 * note at the top of `theme/ThemeProvider.tsx`.
 *
 * `isLTR` changes only `writingDirection`, not the alignment. An address, a
 * phone number and a dinar amount all still read left to right inside their
 * box — that is what 16.2 asks for — but the box itself sits at the reading
 * edge of the language around it, so an Arabic form does not have one field
 * flush left among five flush right.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface InputProps extends Omit<
  TextInputProps,
  'style' | 'onChangeText' | 'value' | 'placeholderTextColor'
> {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Already translated. Callers pass `t(error)`, not the key. */
  errorMessage?: string;
  /** A quiet line under the field, hidden while an error is showing. */
  hint?: string;
  placeholder?: string;
  /** Adds the show/hide control. Use for passwords. */
  isSecure?: boolean;
  /** Already translated labels for that control. Required when `isSecure`. */
  revealLabel?: string;
  hideLabel?: string;
  /** Forces left-to-right *content*: emails, phone numbers, amounts. 16.2. */
  isLTR?: boolean;
  /** Overrides the reading-start alignment. For a centred code field. */
  textAlign?: TextInputProps['textAlign'];
  isDisabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  value,
  onChangeText,
  errorMessage,
  hint,
  placeholder,
  isSecure = false,
  revealLabel,
  hideLabel,
  isLTR = false,
  textAlign,
  isDisabled = false,
  containerStyle,
  testID,
  onFocus,
  onBlur,
  ...rest
}) => {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  const hasError = errorMessage !== undefined && errorMessage !== '';
  const errorTestID = testID === undefined ? undefined : `${testID}-error`;
  const revealTestID = testID === undefined ? undefined : `${testID}-reveal`;

  const borderColor = useMemo(() => {
    if (hasError) return theme.colors.danger;
    if (isFocused) return theme.colors.accent;
    return theme.colors.border;
  }, [hasError, isFocused, theme]);

  // The caller's handlers are forwarded, not replaced. react-hook-form marks a
  // field touched on blur, and swallowing that would mean a field never reports
  // what is wrong with it.
  type FocusHandler = NonNullable<TextInputProps['onFocus']>;

  const handleFocus = useCallback<FocusHandler>(
    (event) => {
      setIsFocused(true);
      onFocus?.(event);
    },
    [onFocus],
  );

  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (event) => {
      setIsFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );
  const toggleReveal = useCallback((): void => setIsRevealed((current) => !current), []);

  return (
    <View style={[styles.container, { gap: theme.spacing.xs }, containerStyle]}>
      <Text variant="small" tone="secondary">
        {label}
      </Text>

      <View
        style={[
          styles.field,
          {
            minHeight: theme.minTouchTarget,
            borderRadius: theme.radii.md,
            borderColor,
            backgroundColor: theme.colors.bgElevated,
            paddingHorizontal: theme.spacing.md,
            opacity: isDisabled ? 0.45 : 1,
          },
        ]}
      >
        <TextInput
          {...rest}
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={!isDisabled}
          secureTextEntry={isSecure && !isRevealed}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel={label}
          style={[
            styles.input,
            {
              color: theme.colors.textPrimary,
              fontSize: theme.typography.body.size,
              lineHeight: theme.typography.body.lineHeight,
              fontFamily: theme.fontFamily('400'),
              paddingVertical: theme.spacing.sm + theme.spacing.xs,
              // Always explicit, and physical — see the note at the top of
              // this file for why this is not `theme.alignStart`.
              textAlign: textAlign ?? theme.inputAlignStart,
              // 16.2: an address or a number reads LTR wherever it is shown.
              writingDirection: isLTR ? 'ltr' : undefined,
            },
          ]}
        />

        {isSecure && revealLabel !== undefined && hideLabel !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isRevealed ? hideLabel : revealLabel}
            testID={revealTestID}
            onPress={toggleReveal}
            hitSlop={theme.spacing.sm}
            style={{
              paddingStart: theme.spacing.sm,
              minHeight: theme.minTouchTarget,
              justifyContent: 'center',
            }}
          >
            <Text variant="small" tone="accent">
              {isRevealed ? hideLabel : revealLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {hasError ? (
        <Text variant="caption" tone="danger" testID={errorTestID}>
          {errorMessage}
        </Text>
      ) : hint === undefined ? null : (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  input: {
    flex: 1,
  },
});

export default Input;
