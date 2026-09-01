/**
 * A native date picker bound to a `yyyy-MM-dd` string. A35's amendment to
 * section 2.1, phase 10 — see OPEN-ITEMS.md.
 *
 * Android's `display="default"` is a system dialog: mounting it opens the
 * dialog, and `onChange` fires once with `event.type` telling apart a real
 * pick from a cancel, after which the dialog is gone on its own — this just
 * unmounts it to match. iOS has no such dialog; the same picker in spinner
 * mode is drawn inline under the field and fires `onChange` continuously as
 * the wheel turns, so each tick is committed as it comes and *Done* only
 * closes the wheel, never confirms anything by itself.
 *
 * The value never touches an Amman conversion — a native `Date` from the
 * wheel encodes the calendar day the device showed, in the device's own
 * local fields, and running it through one could shift it a day for a phone
 * in a different zone. `dayKeyToCalendarDate` (src/lib/time.ts) and
 * `toDayKey` below read and build local calendar fields only, the same way a
 * typed `yyyy-MM-dd` was never zone-converted either.
 */
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';

import { formatSessionDate, ammanDayStart, dayKeyToCalendarDate, nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';

import { Button } from './Button';
import { isolateLTR, Text } from './Text';

/** The inverse of `dayKeyToCalendarDate`: a wheel's local calendar fields, as `yyyy-MM-dd`. */
function toDayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** `yyyy-MM-dd`. Anything else has no calendar day to render or open on. */
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface DateFieldProps {
  label: string;
  /** `yyyy-MM-dd`. */
  value: string;
  onChange: (value: string) => void;
  minimumDate?: Date | undefined;
  hint?: string | undefined;
  errorMessage?: string | undefined;
  /** Already translated. Closes the iOS wheel; every tick is already saved. */
  doneLabel: string;
  testID?: string | undefined;
}

export const DateField: React.FC<DateFieldProps> = ({
  label,
  value,
  onChange,
  minimumDate,
  hint,
  errorMessage,
  doneLabel,
  testID,
}) => {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const openPicker = useCallback((): void => setIsOpen(true), []);
  const closePicker = useCallback((): void => setIsOpen(false), []);

  const handleChange = useCallback(
    (event: DateTimePickerEvent, picked?: Date): void => {
      if (Platform.OS === 'android') {
        setIsOpen(false);
        if (event.type === 'set' && picked !== undefined) onChange(toDayKey(picked));
        return;
      }
      if (picked !== undefined) onChange(toDayKey(picked));
    },
    [onChange],
  );

  const hasError = errorMessage !== undefined && errorMessage !== '';
  const errorTestID = testID === undefined ? undefined : `${testID}-error`;
  const nativeTestID = testID === undefined ? undefined : `${testID}-native`;

  // `ammanDayStart` on anything that is not a day key yields an Invalid Date,
  // and formatting one throws — during render, which takes the screen down
  // rather than showing a validation message. The raw value is rendered
  // instead and the schema is left to say what is wrong with it.
  const isValid = DAY_KEY_PATTERN.test(value);

  return (
    <View style={{ gap: theme.spacing.xs, alignSelf: 'stretch' }}>
      <Text variant="small" tone="secondary">
        {label}
      </Text>

      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
        style={{
          minHeight: theme.minTouchTarget,
          borderRadius: theme.radii.md,
          borderWidth: 1,
          borderColor: hasError ? theme.colors.danger : theme.colors.border,
          backgroundColor: theme.colors.bgElevated,
          paddingHorizontal: theme.spacing.md,
          justifyContent: 'center',
        }}
      >
        {/* 16.2: a date, like an address, reads left to right whatever the app
            language is. `formatSessionDate` is now day/month/year in digits,
            which UAX #9 already resolves as one left-to-right run — the
            isolate is belt and braces for the surrounding paragraph, and the
            Left-to-Right Mark the spelled-month format needed is gone with it.
            Alignment is the theme's, so the field sits at the reading edge of
            the language like every other field on the form. */}
        <Text
          variant="body"
          testID={testID === undefined ? undefined : `${testID}-value`}
          style={{ color: theme.colors.textPrimary, writingDirection: 'ltr' }}
        >
          {isValid ? isolateLTR(formatSessionDate(ammanDayStart(value), theme.locale)) : value}
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
            value={dayKeyToCalendarDate(isValid ? value : toDayKey(nowInAmman()))}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleChange}
            themeVariant="dark"
            {...(minimumDate === undefined ? {} : { minimumDate })}
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

export default DateField;
