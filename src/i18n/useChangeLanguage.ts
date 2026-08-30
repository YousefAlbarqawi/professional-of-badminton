/**
 * Switching language, including the restart.
 *
 * Changing language switches direction, and `I18nManager.forceRTL()` only
 * takes effect after the app reloads. So the player is told plainly what is
 * about to happen rather than watching the app relaunch unannounced.
 * BUILD-SPEC 16.1.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, I18nManager } from 'react-native';

import type { Locale } from '@/lib/money';

import { isRTLLocale, persistLocale } from './index';
import { restart } from './restart';

export interface ChangeLanguage {
  /** Switch to `locale`, prompting for the restart when direction changes. */
  changeLanguage: (locale: Locale) => void;
  /** The locale currently in effect. */
  current: Locale;
  /** True while the restart is being carried out. */
  isRestarting: boolean;
}

export function useChangeLanguage(): ChangeLanguage {
  const { t, i18n } = useTranslation();
  const [isRestarting, setIsRestarting] = useState(false);
  const current: Locale = i18n.language === 'ar' ? 'ar' : 'en';

  const apply = useCallback(
    async (locale: Locale): Promise<void> => {
      await persistLocale(locale);
      await i18n.changeLanguage(locale);

      const shouldBeRTL = isRTLLocale(locale);
      if (I18nManager.isRTL === shouldBeRTL) {
        // Direction is unchanged, so the new strings are already live.
        return;
      }

      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
      setIsRestarting(true);
      await restart();
    },
    [i18n],
  );

  const changeLanguage = useCallback(
    (locale: Locale): void => {
      if (locale === current) return;

      if (I18nManager.isRTL === isRTLLocale(locale)) {
        void apply(locale);
        return;
      }

      Alert.alert(t('language.switchTitle'), t('language.switchBody'), [
        { text: t('language.switchCancel'), style: 'cancel' },
        { text: t('language.switchConfirm'), onPress: () => void apply(locale) },
      ]);
    },
    [apply, current, t],
  );

  return { changeLanguage, current, isRestarting };
}
