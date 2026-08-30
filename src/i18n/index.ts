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
// Hermes ships an `Intl.PluralRules` that has no Arabic plural data, so
// i18next resolves every Arabic count through English one/other rules and the
// `_two`, `_few` and `_many` decks below never render — a three day old
// announcement reads "قبل 3 يوم" where Arabic wants "قبل 3 أيام". Jest does not
// catch it because Node carries full ICU, and iOS does not show it because
// Hermes takes ICU from the system there. BUILD-SPEC 16.1.
//
// `polyfill-force` rather than `polyfill`: the conditional entry keeps a
// native implementation when one exists, and here one does exist — it is just
// wrong for Arabic.
import '@formatjs/intl-pluralrules/polyfill-force.js';
import '@formatjs/intl-pluralrules/locale-data/ar.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import type { Locale } from '@/lib/money';

import ar from './ar.json';
import en from './en.json';
import { restart } from './restart';

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
 * Records the direction a reload has already been attempted for, so a
 * `forceRTL` that never persists cannot relaunch the app forever. In storage
 * rather than in a module variable because the reload it bounds resets the
 * module. See `alignLayoutDirection`.
 */
export const DIRECTION_RELOAD_STORAGE_KEY = 'pob.layoutDirectionReload';

/**
 * Align the native layout direction with `locale`, reloading once when they
 * disagree.
 *
 * `I18nManager.forceRTL()` only takes effect on the *next* launch. Arabic is
 * the default for a fresh install (16.1) and a fresh install starts left to
 * right, so without this the first session after install renders Arabic text
 * inside a left-to-right layout: the navigation back chevron, `Input`'s
 * password reveal and every `flexDirection: 'row'` on the wrong edge. That is
 * the whole of sign-up and sign-in, for the players the default is chosen for.
 * Reloading while the splash screen is still up closes it unseen.
 *
 * The reload is attempted at most once per direction, because `forceRTL`
 * failing to persist is the exact fault being compensated for and an
 * unguarded reload would relaunch forever. Anything that stops the guard being
 * durable — storage unavailable, the reload itself refused — gives up the
 * reload rather than risking the loop: one wrongly mirrored session is a
 * blemish, an app that never opens is not.
 *
 * @returns true when a reload has started and this launch is being replaced,
 *   so the caller must not render.
 */
export async function alignLayoutDirection(locale: Locale): Promise<boolean> {
  const shouldBeRTL = isRTLLocale(locale);
  I18nManager.allowRTL(shouldBeRTL);

  if (I18nManager.isRTL === shouldBeRTL) {
    try {
      // Aligned, so the guard has served its purpose and must not block the
      // next genuine direction change.
      await AsyncStorage.removeItem(DIRECTION_RELOAD_STORAGE_KEY);
    } catch {
      // A marker left behind costs a skipped reload once, never a loop.
    }
    return false;
  }

  I18nManager.forceRTL(shouldBeRTL);

  const marker = String(shouldBeRTL);
  try {
    if ((await AsyncStorage.getItem(DIRECTION_RELOAD_STORAGE_KEY)) === marker) {
      // Already reloaded once for this direction and it did not take. Start
      // the app rather than relaunching into the same failure.
      return false;
    }
    // Written before the reload, not after: the reload never returns.
    await AsyncStorage.setItem(DIRECTION_RELOAD_STORAGE_KEY, marker);
  } catch {
    return false;
  }

  try {
    await restart();
  } catch {
    // A production build without `reloadAsync` is not a reason to sit on the
    // splash screen. The direction is still fixed for the next launch.
    return false;
  }
  return true;
}

/** What `initI18n` settled, for the caller deciding whether to render. */
export interface I18nStartup {
  /** The initialised i18next instance. */
  i18n: I18nInstance;
  /**
   * True when the app is reloading to pick up the layout direction. This
   * launch is being replaced, so nothing should be rendered.
   */
  isReloading: boolean;
}

/**
 * Initialise i18next with the resolved locale, and align the native layout
 * direction with it. Called once, before the first render.
 */
export async function initI18n(): Promise<I18nStartup> {
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

  return { i18n: i18next, isReloading: await alignLayoutDirection(locale) };
}

export default i18next;
