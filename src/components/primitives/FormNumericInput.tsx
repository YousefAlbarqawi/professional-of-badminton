/**
 * A `NumericInput` bound to react-hook-form. `FormField`'s pattern, for the
 * fields that hold money.
 *
 * It exists because a plain `FormField` on a money field lets anything the
 * keyboard can produce reach the form state, and the screens compute a live
 * preview from that state *during render* — `fils(Number(value))` on a
 * half-typed value. `fils()` throws on a non-finite number (5.3, deliberately:
 * money must never quietly become NaN), so one stray character took the screen
 * down before the schema had a chance to say what was wrong with it.
 *
 * `NumericInput` normalises at the point of entry instead, so the value in the
 * form is always a dinar amount or a prefix of one. The schema still validates
 * — a keyboard is not a security boundary and a paste is not a keystroke — but
 * it is no longer the only thing standing between a typo and a crash.
 */
import React from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { NumericInput, type NumericInputProps } from './NumericInput';

export interface FormNumericInputProps<TValues extends FieldValues> extends Omit<
  NumericInputProps,
  'value' | 'onChangeText' | 'errorMessage' | 'onBlur'
> {
  control: Control<TValues>;
  name: FieldPath<TValues>;
}

export function FormNumericInput<TValues extends FieldValues>({
  control,
  name,
  ...inputProps
}: FormNumericInputProps<TValues>): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <NumericInput
          {...inputProps}
          value={typeof field.value === 'string' ? field.value : ''}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          {...(fieldState.error?.message === undefined
            ? {}
            : { errorMessage: t(fieldState.error.message) })}
        />
      )}
    />
  );
}

export default FormNumericInput;
