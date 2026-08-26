/**
 * Welcome. BUILD-SPEC 14.1.
 *
 * Logo centred on the dark background, wordmark below, two buttons, and the
 * language toggle in the top corner. No WhatsApp affordance: a stranger who has
 * just installed the app has no reason to message the coach, which is the one
 * exception D72 allows.
 */
import React, { useCallback } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Text } from '@/components/primitives';
import { useChangeLanguage } from '@/i18n/useChangeLanguage';
import { useTheme } from '@/theme';
import type { AuthStackParamList } from '@/app/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const LOGO = require('../../../assets/icon.png') as number;

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { changeLanguage, current } = useChangeLanguage();

  const goToSignIn = useCallback((): void => navigation.navigate('SignIn'), [navigation]);
  const goToSignUp = useCallback((): void => navigation.navigate('SignUp'), [navigation]);
  const toggleLanguage = useCallback(
    (): void => changeLanguage(current === 'ar' ? 'en' : 'ar'),
    [changeLanguage, current],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg, padding: theme.spacing.lg }]}>
      <View style={styles.toggleRow}>
        <Button
          label={current === 'ar' ? t('language.english') : t('language.arabic')}
          onPress={toggleLanguage}
          variant="ghost"
          accessibilityHint={t('language.label')}
          testID="welcome-language-toggle"
        />
      </View>

      <View style={[styles.centre, { gap: theme.spacing.lg }]}>
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <Text variant="title" align="center">
          {t('auth.welcomeTitle')}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label={t('auth.signIn')}
          onPress={goToSignIn}
          isFullWidth
          testID="welcome-sign-in"
        />
        <Button
          label={t('auth.signUp')}
          onPress={goToSignUp}
          variant="secondary"
          isFullWidth
          testID="welcome-sign-up"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 140,
    height: 140,
  },
});

export default WelcomeScreen;
