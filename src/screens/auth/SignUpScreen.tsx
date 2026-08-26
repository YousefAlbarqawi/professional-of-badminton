/**
 * Sign up. BUILD-SPEC 14.2 and D11.
 *
 * Five fields plus the confirmation, in the order the spec gives, all required.
 * No terms checkbox, no marketing opt-in, no referral code, and no coach
 * approval — D13 lets anyone who downloads the app register and book.
 */
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, FormField, Text } from '@/components/primitives';
import { toAppAuthError } from '@/features/auth/errors';
import { useSignUp } from '@/features/auth/mutations';
import { usePendingVerification } from '@/features/auth/pendingVerification';
import { normaliseSignUp, signUpSchema, type SignUpFormValues } from '@/features/auth/schemas';
import { useTheme } from '@/theme';
import type { AuthStackParamList } from '@/app/types';

import { AuthLayout } from './AuthLayout';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

const EMPTY_FORM: SignUpFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

export const SignUpScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const signUp = useSignUp();
  const { setPending } = usePendingVerification();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isEmailTaken, setIsEmailTaken] = useState(false);

  const { control, handleSubmit, formState } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: EMPTY_FORM,
    // Validates once a field has been left, then on every keystroke. The
    // player is not corrected while he is still typing his first character,
    // and the submit button knows whether the form is valid.
    mode: 'onTouched',
  });

  const goToSignIn = useCallback((): void => navigation.navigate('SignIn'), [navigation]);

  const onSubmit = useCallback(
    (values: SignUpFormValues): void => {
      setSubmitError(null);
      setIsEmailTaken(false);
      const input = normaliseSignUp(values);

      signUp.mutate(input, {
        onSuccess: () => {
          // The password is kept for the verify screen's poll and for nothing
          // else. It never becomes a navigation param.
          setPending({ email: input.email, password: input.password, signUpInput: input });
          navigation.navigate('VerifyEmail', { email: input.email });
        },
        onError: (error) => {
          const mapped = toAppAuthError(error);
          setIsEmailTaken(mapped.code === 'email_in_use');
          setSubmitError(t(mapped.messageKey));
        },
      });
    },
    [navigation, setPending, signUp, t],
  );

  return (
    <AuthLayout
      title={t('auth.signUp')}
      testID="sign-up-screen"
      footer={
        <>
          <Text variant="small" tone="secondary">
            {t('auth.haveAccount')}
          </Text>
          <Button label={t('auth.signIn')} onPress={goToSignIn} variant="ghost" />
        </>
      }
    >
      <FormField
        control={control}
        name="firstName"
        label={t('auth.firstName')}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="next"
        testID="sign-up-first-name"
      />

      <FormField
        control={control}
        name="lastName"
        label={t('auth.lastName')}
        autoCapitalize="words"
        autoComplete="family-name"
        textContentType="familyName"
        returnKeyType="next"
        testID="sign-up-last-name"
      />

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
        testID="sign-up-email"
      />

      <FormField
        control={control}
        name="phone"
        label={t('auth.phone')}
        hint={t('auth.phoneHint')}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        isLTR
        returnKeyType="next"
        testID="sign-up-phone"
      />

      <FormField
        control={control}
        name="password"
        label={t('auth.password')}
        hint={t('auth.passwordHint')}
        isSecure
        revealLabel={t('common.show')}
        hideLabel={t('common.hide')}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        testID="sign-up-password"
      />

      <FormField
        control={control}
        name="confirmPassword"
        label={t('auth.confirmPassword')}
        isSecure
        revealLabel={t('common.show')}
        hideLabel={t('common.hide')}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        testID="sign-up-confirm-password"
      />

      {submitError === null ? null : (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="small" tone="danger" testID="sign-up-error">
            {submitError}
          </Text>
          {isEmailTaken ? (
            <Button
              label={t('auth.signInInstead')}
              onPress={goToSignIn}
              variant="ghost"
              testID="sign-up-sign-in-instead"
            />
          ) : null}
        </View>
      )}

      <Button
        label={t('auth.signUp')}
        onPress={handleSubmit(onSubmit)}
        // 14.2: submit is disabled until the form is valid.
        isDisabled={!formState.isValid}
        isLoading={signUp.isPending}
        isFullWidth
        testID="sign-up-submit"
      />
    </AuthLayout>
  );
};

export default SignUpScreen;
