/**
 * Welcome. BUILD-SPEC 14.1.
 *
 * Logo centred on the dark background, wordmark below, two buttons, and the
 * language toggle in the top corner. No WhatsApp affordance: a stranger who has
 * just installed the app has no reason to message the coach, which is the one
 * exception D72 allows.
 *
 * This is the only screen in the app with `headerShown: false`, so it is also
 * the only one that has to clear the status bar itself. Without the top inset
 * the language toggle sat under the notch on every iPhone with one — the first
 * control a new player sees, half hidden. The bottom inset keeps the two
 * buttons off the home indicator for the same reason.
 *
 * ── What was added to 14.1's four elements ────────────────
 * 14.1 lists the logo, the wordmark and the two buttons, and all four are
 * unchanged. Two things sit around them now, on client instruction to make the
 * screen feel alive rather than like a form with nothing in it yet:
 *
 *   - `WelcomeBackdrop`, drifting shuttlecocks and sport icons behind
 *     everything. Decorative, inert, and invisible to a screen reader — see
 *     that file.
 *   - A one-line subtitle under the wordmark, which is the same sentence the
 *     App Store listing leads with, so the first screen and the store entry
 *     say the same thing.
 *
 * A mint halo behind the logo was tried and removed at the client's request.
 * Nothing replaced it: the logo sits directly on the background, and the
 * drifting pieces are the only thing behind it.
 *
 * The layout is a padded content layer over an unpadded root, rather than one
 * padded view: `position: absolute` resolves against the padding box, so a
 * backdrop inside the padded view would have stopped 24pt short of every edge.
 */
import React, { useCallback } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Text } from '@/components/primitives';
import { useChangeLanguage } from '@/i18n/useChangeLanguage';
import { useTheme } from '@/theme';
import type { AuthStackParamList } from '@/app/types';

import { WelcomeBackdrop } from './WelcomeBackdrop';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const LOGO = require('../../../assets/icon.png') as number;

const LOGO_SIZE = 140;

export const WelcomeScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { changeLanguage, current } = useChangeLanguage();

  const goToSignIn = useCallback((): void => navigation.navigate('SignIn'), [navigation]);
  const goToSignUp = useCallback((): void => navigation.navigate('SignUp'), [navigation]);
  const toggleLanguage = useCallback(
    (): void => changeLanguage(current === 'ar' ? 'en' : 'ar'),
    [changeLanguage, current],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <WelcomeBackdrop />

      <View
        style={[
          styles.content,
          {
            padding: theme.spacing.lg,
            paddingTop: insets.top + theme.spacing.sm,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
          },
        ]}
      >
        <View style={styles.toggleRow}>
          <Button
            label={current === 'ar' ? t('language.english') : t('language.arabic')}
            onPress={toggleLanguage}
            variant="ghost"
            accessibilityHint={t('language.label')}
            testID="welcome-language-toggle"
          />
        </View>

        <View style={[styles.centre, { gap: theme.spacing.md }]}>
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
          <Text variant="body" tone="secondary" align="center" testID="welcome-subtitle">
            {t('auth.welcomeSubtitle')}
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
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
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
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});

export default WelcomeScreen;
