/**
 * Localization. BUILD-SPEC section 16.
 *
 * Arabic is the default for a new install regardless of device locale, because
 * the majority of players are Jordanian. The device locale is used only as a
 * tiebreak when it is English.
 *
 * The chosen language is mirrored to device storage so it survives before
 * login; once there is a profile it also lives on `profiles.preferred_locale`
 * (from Phase 2 onwards).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import type { Locale } from '@/lib/money';

import ar from './ar.json';
import en from './en.json';

export const SUPPORTED_LOCALES = ['ar', 'en'] as const;

/** Arabic is the default for a new install. BUILD-SPEC 16.1. */
export const DEFAULT_LOCALE: Locale = 'ar';

export const LOCALE_STORAGE_KEY = 'pob.locale';

export const resources = {
  en: { translation: en },
  ar: { translation: ar },
} as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Arabic is written right to left; English is not. */
export function isRTLLocale(locale: Locale): boolean {
  return locale === 'ar';
}

/**
 * The locale a fresh install should start in. Arabic unless the device is set
 * to English, which is the only tiebreak section 16.1 allows.
 */
export function deviceDefaultLocale(): Locale {
  const languageCode = getLocales()[0]?.languageCode;
  return languageCode === 'en' ? 'en' : DEFAULT_LOCALE;
}

/** The stored choice, or the device default when there is not one yet. */
export async function resolveInitialLocale(): Promise<Locale> {
  try {
    const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // A storage read failure must never stop the app from starting. Fall
    // through to the device default.
  }
  return deviceDefaultLocale();
}

export async function persistLocale(locale: Locale): Promise<void> {
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

/**
 * Initialise i18next with the resolved locale, and align the native layout
 * direction with it. Called once, before the first render.
 */
export async function initI18n(): Promise<I18nInstance> {
  const locale = await resolveInitialLocale();

  // eslint-disable-next-line import/no-named-as-default-member -- i18next.use is the instance method, not the named export of the same name.
  await i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    // Keys are namespaced by an object path, not by i18next namespaces.
    defaultNS: 'translation',
    interpolation: {
      // React Native has no HTML to inject into.
      escapeValue: false,
    },
    returnNull: false,
  });

  const shouldBeRTL = isRTLLocale(locale);
  I18nManager.allowRTL(shouldBeRTL);
  if (I18nManager.isRTL !== shouldBeRTL) {
    // Takes effect on the next launch; the language switch handles the restart
    // conversation with the player. See useChangeLanguage.
    I18nManager.forceRTL(shouldBeRTL);
  }

  return i18next;
}

export default i18next;
