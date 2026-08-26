/**
 * Forgot password. BUILD-SPEC 14.5.
 *
 * The confirmation is deliberately worded as a conditional — "if that address
 * has an account" — and is shown whether or not one does. A form that answered
 * differently for a known address would be a way to enumerate the academy's
 * members.
 */
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, FormField, Text, isolateLTR } from '@/components/primitives';
import { toAppAuthError } from '@/features/auth/errors';
import { useRequestPasswordReset } from '@/features/auth/mutations';
import {
  forgotPasswordSchema,
  normaliseEmail,
  type ForgotPasswordFormValues,
} from '@/features/auth/schemas';
import type { AuthStackParamList } from '@/app/types';

import { AuthLayout } from './AuthLayout';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export const ForgotPasswordScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const requestReset = useRequestPasswordReset();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: route.params?.email ?? '' },
    mode: 'onTouched',
  });

  const onSubmit = useCallback(
    (values: ForgotPasswordFormValues): void => {
      setSubmitError(null);
      const email = normaliseEmail(values.email);

      requestReset.mutate(email, {
        onSuccess: () => setSentTo(email),
        // Only a rate limit or a dead connection reaches here; an unknown
        // address is reported as success by design.
        onError: (error) => setSubmitError(t(toAppAuthError(error).messageKey)),
      });
    },
    [requestReset, t],
  );

  const goBackToSignIn = useCallback((): void => navigation.navigate('SignIn'), [navigation]);

  if (sentTo !== null) {
    return (
      <AuthLayout
        title={t('auth.forgotSentTitle')}
        subtitle={t('auth.forgotSentBody', { email: isolateLTR(sentTo) })}
        testID="forgot-password-sent"
      >
        <Button
          label={t('auth.backToSignIn')}
          onPress={goBackToSignIn}
          isFullWidth
          testID="forgot-back-to-sign-in"
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotBody')}
      testID="forgot-password-screen"
      footer={<Button label={t('auth.backToSignIn')} onPress={goBackToSignIn} variant="ghost" />}
    >
      <FormField
        control={control}
        name="email"
        label={t('auth.email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        isLTR
        returnKeyType="done"
        onSubmitEditing={handleSubmit(onSubmit)}
        testID="forgot-email"
      />

      {submitError === null ? null : (
        <Text variant="small" tone="danger" testID="forgot-error">
          {submitError}
        </Text>
      )}

      <Button
        label={t('auth.forgotSubmit')}
        onPress={handleSubmit(onSubmit)}
        isDisabled={!formState.isValid}
        isLoading={requestReset.isPending}
        isFullWidth
        testID="forgot-submit"
      />
    </AuthLayout>
  );
};

export default ForgotPasswordScreen;
