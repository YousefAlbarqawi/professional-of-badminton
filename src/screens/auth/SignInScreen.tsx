/**
 * Sign in. BUILD-SPEC 14.4.
 *
 * A wrong email and a wrong password give the same answer. Telling them apart
 * would let anyone use this form to find out who has an account.
 *
 * An account that exists but has never been confirmed is the one case that gets
 * a different treatment: rather than an error he cannot act on, the player is
 * taken to the verify screen, which is already waiting for exactly that link.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, FormField, Text } from '@/components/primitives';
import { toAppAuthError } from '@/features/auth/errors';
import { useSignIn } from '@/features/auth/mutations';
import { usePendingVerification } from '@/features/auth/pendingVerification';
import { normaliseSignIn, signInSchema, type SignInFormValues } from '@/features/auth/schemas';
import type { AuthStackParamList } from '@/app/types';

import { AuthLayout } from './AuthLayout';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

export const SignInScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const signIn = useSignIn();
  const { setPending } = usePendingVerification();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit, formState, getValues } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: route.params?.email ?? '', password: '' },
    mode: 'onTouched',
  });

  const onSubmit = useCallback(
    (values: SignInFormValues): void => {
      setSubmitError(null);
      const input = normaliseSignIn(values);

      signIn.mutate(input, {
        // Nothing to do on success. The session lands, AuthProvider hears about
        // it, and RootNavigator swaps this stack for the player's tabs.
        onError: (error) => {
          const mapped = toAppAuthError(error);
          if (mapped.code === 'email_not_confirmed') {
            setPending({ email: input.email, password: input.password, signUpInput: null });
            navigation.navigate('VerifyEmail', { email: input.email });
            return;
          }
          setSubmitError(t(mapped.messageKey));
        },
      });
    },
    [navigation, setPending, signIn, t],
  );

  const goToSignUp = useCallback((): void => navigation.navigate('SignUp'), [navigation]);

  const goToForgotPassword = useCallback((): void => {
    navigation.navigate('ForgotPassword', { email: getValues('email') });
  }, [getValues, navigation]);

  return (
    <AuthLayout
      title={t('auth.signIn')}
      testID="sign-in-screen"
      footer={
        <>
          <Text variant="small" tone="secondary">
            {t('auth.noAccount')}
          </Text>
          <Button
            label={t('auth.signUp')}
            onPress={goToSignUp}
            variant="ghost"
            style={styles.footerButton}
          />
        </>
      }
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
        returnKeyType="next"
        testID="sign-in-email"
      />

      <FormField
        control={control}
        name="password"
        label={t('auth.password')}
        isSecure
        revealLabel={t('common.show')}
        hideLabel={t('common.hide')}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={handleSubmit(onSubmit)}
        testID="sign-in-password"
      />

      {submitError === null ? null : (
        <Text variant="small" tone="danger" testID="sign-in-error">
          {submitError}
        </Text>
      )}

      <Button
        label={t('auth.signIn')}
        onPress={handleSubmit(onSubmit)}
        isDisabled={!formState.isValid}
        isLoading={signIn.isPending}
        isFullWidth
        testID="sign-in-submit"
      />

      <Button
        label={t('auth.forgotPassword')}
        onPress={goToForgotPassword}
        variant="ghost"
        testID="sign-in-forgot"
      />
    </AuthLayout>
  );
};

const styles = StyleSheet.create({
  footerButton: {
    alignSelf: 'center',
  },
});

export default SignInScreen;
