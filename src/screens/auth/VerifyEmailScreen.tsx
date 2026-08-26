/**
 * Verify email. BUILD-SPEC 14.3 and D12.
 *
 * The screen a player sees for as long as it takes him to open his mail app,
 * tap a link and come back. It moves on by itself when he does: the poll is a
 * sign-in attempt that fails with `email_not_confirmed` until the moment it
 * succeeds, and a successful one puts a session in place, which RootNavigator
 * reacts to.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Dialog, FormField, Text, isolateLTR } from '@/components/primitives';
import { toAppAuthError } from '@/features/auth/errors';
import { useResendConfirmation, useSignUp } from '@/features/auth/mutations';
import { usePendingVerification } from '@/features/auth/pendingVerification';
import { useEmailConfirmationPoll } from '@/features/auth/queries';
import {
  changeEmailSchema,
  normaliseEmail,
  type ChangeEmailFormValues,
} from '@/features/auth/schemas';
import { useTheme } from '@/theme';
import type { AuthStackParamList } from '@/app/types';

import { AuthLayout } from './AuthLayout';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

/** 14.3: "offers *Resend* with a 60 second cooldown". */
export const RESEND_COOLDOWN_SECONDS = 60;

export const VerifyEmailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { pending, setPending } = usePendingVerification();
  const resend = useResendConfirmation();
  const signUp = useSignUp();

  // A link went out a moment ago, at sign up. The cooldown starts full so the
  // first thing the player can do is not to ask for a second copy of it.
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  const email = pending?.email ?? route.params.email;

  const poll = useEmailConfirmationPoll(pending);

  // One interval for the whole cooldown rather than a timeout per second: a
  // chain of timeouts only advances as fast as the component re-renders, which
  // makes it drift on a slow phone and untestable under fake timers.
  const isCoolingDown = secondsLeft > 0;

  useEffect(() => {
    if (!isCoolingDown) return undefined;
    const ticker = setInterval(() => {
      setSecondsLeft((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => clearInterval(ticker);
  }, [isCoolingDown]);

  // Derived, not stored. The poll owns its own failure; copying it into state
  // would only give the screen a second, staler version of the same fact.
  const errorMessage =
    actionError ?? (poll.error == null ? null : t(toAppAuthError(poll.error).messageKey));

  const { control, handleSubmit, formState, reset } = useForm<ChangeEmailFormValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { email },
    mode: 'onTouched',
  });

  const handleResend = useCallback((): void => {
    setNotice(null);
    setActionError(null);
    resend.mutate(email, {
      onSuccess: () => {
        setNotice(t('auth.resendSent'));
        setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      },
      onError: (error) => setActionError(t(toAppAuthError(error).messageKey)),
    });
  }, [email, resend, t]);

  const openChangeEmail = useCallback((): void => {
    reset({ email });
    setIsChangingEmail(true);
  }, [email, reset]);

  const closeChangeEmail = useCallback((): void => setIsChangingEmail(false), []);

  const submitChangeEmail = useCallback(
    (values: ChangeEmailFormValues): void => {
      const previous = pending?.signUpInput ?? null;
      const nextEmail = normaliseEmail(values.email);

      if (previous === null || nextEmail === previous.email) {
        setIsChangingEmail(false);
        return;
      }

      setNotice(null);
      setActionError(null);

      // There is no session yet, so there is no account to edit — the address
      // is changed by registering the correct one, with the same five fields.
      // The abandoned attempt stays unconfirmed and can never be signed in to.
      const nextInput = { ...previous, email: nextEmail };

      signUp.mutate(nextInput, {
        onSuccess: () => {
          setPending({
            email: nextEmail,
            password: nextInput.password,
            signUpInput: nextInput,
          });
          navigation.setParams({ email: nextEmail });
          setSecondsLeft(RESEND_COOLDOWN_SECONDS);
          setIsChangingEmail(false);
          setNotice(t('auth.resendSent'));
        },
        onError: (error) => {
          setIsChangingEmail(false);
          setActionError(t(toAppAuthError(error).messageKey));
        },
      });
    },
    [navigation, pending, setPending, signUp, t],
  );

  const goToSignIn = useCallback(
    (): void => navigation.navigate('SignIn', { email }),
    [email, navigation],
  );

  const canResend = !isCoolingDown && !resend.isPending;

  return (
    <AuthLayout
      title={t('auth.verifyTitle')}
      subtitle={t('auth.verifyBody', { email: isolateLTR(email) })}
      testID="verify-email-screen"
      footer={<Button label={t('auth.backToSignIn')} onPress={goToSignIn} variant="ghost" />}
    >
      <Text variant="body" tone="secondary">
        {t('auth.verifyWaiting')}
      </Text>

      <Button
        label={canResend ? t('auth.resend') : t('auth.resendCooldown', { seconds: secondsLeft })}
        onPress={handleResend}
        isDisabled={!canResend}
        isLoading={resend.isPending}
        isFullWidth
        testID="verify-resend"
      />

      {/* Only offered when there is a sign-up to repeat. Arriving here from
          sign in means the account already exists at this address and there is
          nothing to change, only to confirm. */}
      {pending?.signUpInput === null || pending?.signUpInput === undefined ? null : (
        <Button
          label={t('auth.changeEmail')}
          onPress={openChangeEmail}
          variant="ghost"
          testID="verify-change-email"
        />
      )}

      <View style={{ gap: theme.spacing.xs }}>
        {notice === null ? null : (
          <Text variant="small" tone="accent" testID="verify-notice">
            {notice}
          </Text>
        )}
        {errorMessage === null ? null : (
          <Text variant="small" tone="danger" testID="verify-error">
            {errorMessage}
          </Text>
        )}
        <Text variant="caption" tone="tertiary">
          {t('auth.verifySpam')}
        </Text>
      </View>

      <Dialog
        isVisible={isChangingEmail}
        title={t('auth.changeEmailTitle')}
        message={t('auth.changeEmailBody')}
        confirmLabel={t('auth.changeEmailConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleSubmit(submitChangeEmail)}
        onCancel={closeChangeEmail}
        isConfirmDisabled={!formState.isValid}
        isConfirming={signUp.isPending}
        testID="verify-change-email-dialog"
      >
        <FormField
          control={control}
          name="email"
          label={t('auth.email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          isLTR
          testID="verify-change-email-input"
        />
      </Dialog>
    </AuthLayout>
  );
};

export default VerifyEmailScreen;
