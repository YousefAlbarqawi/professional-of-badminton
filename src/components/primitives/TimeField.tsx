/**
 * A native time picker bound to an `HH:mm` string — `DateField`'s twin for the
 * one other thing the staff session forms ask a coach to type.
 *
 * It replaces a plain text field that held 24 hour `HH:mm`. Two problems with
 * that, both reported from the gym: the coach reads "7:00 PM" everywhere else
 * in the app (16.1) and had to convert it in his head to type "19:00", and a
 * free text field accepts "7pm", "19", "1900" and ":" — none of which the
 * `HH:mm` pattern in `features/sessions/schemas.ts` allows, so the form told
 * him he was wrong without telling him what right looked like.
 *
 * The wheel is the answer to both. `is24Hour={false}` puts an AM/PM column on
 * it, so what he picks matches what the field then reads back, and a value
 * that came off a wheel cannot fail the pattern.
 *
 * ── Why the string is the source of truth ─────────────────
 * `HH:mm` is what Postgres takes (`session_templates.start_time` is a bare
 * `time`), and a time of day has no date, so it has no instant either — see
 * the note at the top of `src/lib/time.ts`. The `Date` handed to the picker
 * exists only to position the wheel: it is built from, and immediately read
 * back into, local hour and minute fields, and never crosses a timezone.
 *
 * Platform behaviour is `DateField`'s, for the same reasons documented there:
 * Android's `display="default"` is a system dialog that fires once and closes
 * itself, iOS's spinner is drawn inline and fires on every tick.
 */
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { clockToCalendarDate, formatClockTime } from '@/lib/time';
import { useTheme } from '@/theme';

import { Button } from './Button';
import { isolateLTR, Text } from './Text';

/** `HH:mm`, 24 hour — what the field holds and what the schema validates. */
const CLOCK_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** A wheel's local hour and minute, as `HH:mm`. */
function toClock(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export interface TimeFieldProps {
  label: string;
  /** `HH:mm`, 24 hour. */
  value: string;
  onChange: (value: string) => void;
  hint?: string | undefined;
  errorMessage?: string | undefined;
  /** Already translated. Closes the iOS wheel; every tick is already saved. */
  doneLabel: string;
  isDisabled?: boolean;
  testID?: string | undefined;
}

export const TimeField: React.FC<TimeFieldProps> = ({
  label,
  value,
  onChange,
  hint,
  errorMessage,
  doneLabel,
  isDisabled = false,
  testID,
}) => {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const openPicker = useCallback((): void => {
    if (!isDisabled) setIsOpen(true);
  }, [isDisabled]);
  const closePicker = useCallback((): void => setIsOpen(false), []);

  const handleChange = useCallback(
    (event: DateTimePickerEvent, picked?: Date): void => {
      if (Platform.OS === 'android') {
        setIsOpen(false);
        if (event.type === 'set' && picked !== undefined) onChange(toClock(picked));
        return;
      }
      if (picked !== undefined) onChange(toClock(picked));
    },
    [onChange],
  );

  const hasError = errorMessage !== undefined && errorMessage !== '';
  const errorTestID = testID === undefined ? undefined : `${testID}-error`;
  const nativeTestID = testID === undefined ? undefined : `${testID}-native`;

  // A value that has not been through the wheel yet — a malformed default, or
  // an empty form field — has nothing to render as a clock. The field shows
  // the raw string rather than throwing, and the schema reports it.
  const isValid = CLOCK_PATTERN.test(value);

  return (
    <View style={{ gap: theme.spacing.xs, alignSelf: 'stretch' }}>
      <Text variant="small" tone="secondary">
        {label}
      </Text>

      <Pressable
        onPress={openPicker}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled }}
        testID={testID}
        style={{
          minHeight: theme.minTouchTarget,
          borderRadius: theme.radii.md,
          borderWidth: 1,
          borderColor: hasError ? theme.colors.danger : theme.colors.border,
          backgroundColor: theme.colors.bgElevated,
          paddingHorizontal: theme.spacing.md,
          justifyContent: 'center',
          opacity: isDisabled ? 0.45 : 1,
        }}
      >
        {/* 16.2: a clock reading, like a date, runs left to right in both
            languages — the Arabic meridiem word beside it does not, which is
            what the isolate is for. `formatClockTime` supplies "7:00 PM" or
            "7:00 مساءً" (16.1), the same string every other time in the app
            renders as, so the field reads back exactly what the wheel showed. */}
        <Text
          variant="body"
          testID={testID === undefined ? undefined : `${testID}-value`}
          style={{ color: theme.colors.textPrimary }}
        >
          {isValid ? isolateLTR(formatClockTime(value, theme.locale)) : value}
        </Text>
      </Pressable>

      {hasError ? (
        <Text variant="caption" tone="danger" testID={errorTestID}>
          {errorMessage}
        </Text>
      ) : hint === undefined ? null : (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      )}

      {isOpen ? (
        <View style={{ gap: theme.spacing.sm }}>
          <DateTimePicker
            testID={nativeTestID}
            value={clockToCalendarDate(isValid ? value : '19:00')}
            mode="time"
            // The AM/PM column. Without it the wheel is 24 hour and the field
            // under it is not, which is the mismatch this component exists to
            // remove.
            is24Hour={false}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleChange}
            themeVariant="dark"
          />
          {Platform.OS === 'ios' ? (
            <Button
              label={doneLabel}
              onPress={closePicker}
              variant="ghost"
              {...(testID === undefined ? {} : { testID: `${testID}-done` })}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

export default TimeField;
