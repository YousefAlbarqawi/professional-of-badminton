/**
 * An `Input` bound to react-hook-form.
 *
 * The schemas put i18n keys in their messages rather than sentences, so this is
 * where a key becomes text. Every form in the app validates the same way and
 * reports it the same way, in whichever language is running.
 */
import React from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input, type InputProps } from './Input';

export interface FormFieldProps<TValues extends FieldValues> extends Omit<
  InputProps,
  'value' | 'onChangeText' | 'errorMessage' | 'onBlur'
> {
  control: Control<TValues>;
  name: FieldPath<TValues>;
}

export function FormField<TValues extends FieldValues>({
  control,
  name,
  ...inputProps
}: FormFieldProps<TValues>): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          {...inputProps}
          value={typeof field.value === 'string' ? field.value : ''}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          // The message is a key such as `validation.emailInvalid`.
          {...(fieldState.error?.message === undefined
            ? {}
            : { errorMessage: t(fieldState.error.message) })}
        />
      )}
    />
  );
}

export default FormField;
