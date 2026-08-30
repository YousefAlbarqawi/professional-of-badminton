/**
 * The signed-out stack. BUILD-SPEC 14.0.
 *
 * Welcome, SignIn, SignUp, VerifyEmail, ForgotPassword. D10: nothing else gets
 * in — no OAuth button, no magic link, no phone number entry.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';

import { PendingVerificationProvider } from '@/features/auth/pendingVerification';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { SignInScreen } from '@/screens/auth/SignInScreen';
import { SignUpScreen } from '@/screens/auth/SignUpScreen';
import { VerifyEmailScreen } from '@/screens/auth/VerifyEmailScreen';
import { WelcomeScreen } from '@/screens/auth/WelcomeScreen';
import { colors } from '@/theme';

import { ScreenHeader } from './ScreenHeader';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    // The pending sign-up lives above the screens so that SignUp, SignIn and
    // VerifyEmail all see the same one without it becoming a route param.
    <PendingVerificationProvider>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          headerBackButtonDisplayMode: 'minimal',
          // The whole bar is drawn by React Native, not UIKit. See
          // ScreenHeader.
          header: (props: NativeStackHeaderProps) => <ScreenHeader {...props} />,
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="SignIn"
          component={SignInScreen}
          options={{ title: t('auth.signIn') }}
        />
        <Stack.Screen
          name="SignUp"
          component={SignUpScreen}
          options={{ title: t('auth.signUp') }}
        />
        <Stack.Screen
          name="VerifyEmail"
          component={VerifyEmailScreen}
          options={{
            title: t('auth.verifyTitle'),
            // Going "back" from here would land on the sign-up form for an
            // account that already exists. The screen offers its own way out.
            headerBackVisible: false,
            // Undoes the stack-wide replacement, which would otherwise put
            // the control back on the one screen that must not have it.
            header: (props: NativeStackHeaderProps) => <ScreenHeader {...props} hideBack />,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="ForgotPassword"
          component={ForgotPasswordScreen}
          options={{ title: t('auth.forgotTitle') }}
        />
      </Stack.Navigator>
    </PendingVerificationProvider>
  );
};

export default AuthNavigator;
