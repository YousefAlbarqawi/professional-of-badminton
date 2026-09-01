/**
 * A `DateField` bound to react-hook-form. FormField's own pattern, for the
 * one field type it cannot cover: `Input`'s `onChangeText` is one string
 * argument, `DateField`'s `onChange` already is one, so this is the same
 * `Controller` wiring rather than a new one.
 */
import React from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { DateField, type DateFieldProps } from './DateField';

export interface FormDateFieldProps<TValues extends FieldValues> extends Omit<
  DateFieldProps,
  'value' | 'onChange' | 'errorMessage'
> {
  control: Control<TValues>;
  name: FieldPath<TValues>;
}

export function FormDateField<TValues extends FieldValues>({
  control,
  name,
  ...fieldProps
}: FormDateFieldProps<TValues>): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <DateField
          {...fieldProps}
          value={typeof field.value === 'string' ? field.value : ''}
          onChange={field.onChange}
          {...(fieldState.error?.message === undefined
            ? {}
            : { errorMessage: t(fieldState.error.message) })}
        />
      )}
    />
  );
}

export default FormDateField;
