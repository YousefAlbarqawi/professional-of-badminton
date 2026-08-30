/**
 * A `TimeField` bound to react-hook-form. `FormDateField`'s pattern exactly:
 * one `Controller`, one string in and one string out, and the schema's i18n
 * key turned into a sentence here rather than in the field.
 */
import React from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { TimeField, type TimeFieldProps } from './TimeField';

export interface FormTimeFieldProps<TValues extends FieldValues>
  extends Omit<TimeFieldProps, 'value' | 'onChange' | 'errorMessage'> {
  control: Control<TValues>;
  name: FieldPath<TValues>;
}

export function FormTimeField<TValues extends FieldValues>({
  control,
  name,
  ...fieldProps
}: FormTimeFieldProps<TValues>): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TimeField
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

export default FormTimeField;
