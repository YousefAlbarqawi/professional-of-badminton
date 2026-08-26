/**
 * Getting this phone's Expo push token.
 * BUILD-SPEC section 18: "Tokens registered on login and refreshed on every
 * cold start, stored in `device_tokens`."
 *
 * ── Why this never asks for permission ───────────────────
 * Section 18 again: "Permission is requested contextually, the first time the
 * player joins a waiting list, not on first launch." A cold start is first
 * launch for anyone who has not joined a list yet, so acquiring a token here
 * must not be allowed to trigger the system dialog. It checks, and stops if
 * the answer is no. `requestNotificationPermission` in `permissions.ts` is the
 * one place that asks, and it is called from the waiting list join and nowhere
 * else.
 *
 * The order that produces is deliberate: a player who never joins a waiting
 * list has no token, and therefore receives no announcement push either. That
 * is what section 18 asks for. The moment he grants permission the join flow
 * registers immediately, so he does not have to restart the app to start
 * hearing about anything.
 *
 * ── Why a missing project id is not an error ─────────────
 * `getExpoPushTokenAsync` needs the EAS project the credentials belong to,
 * which is a deployment value this repository does not hold. Without it there
 * is nothing to register and nothing that could work, so the attempt is
 * skipped quietly rather than surfacing an error on a screen the player did
 * not open. See OPEN-ITEMS.md.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { config } from '@/lib/config';
import i18n, { DEFAULT_LOCALE, isLocale } from '@/i18n';

import type { DeviceTokenRegistration } from './types';

/**
 * Android delivers to a channel or it does not deliver. `default` is the id
 * the `send-push` edge function puts on every message; iOS ignores it.
 */
export const ANDROID_CHANNEL_ID = 'default';

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Professional of Badminton',
      importance: Notifications.AndroidImportance.HIGH,
      // 17.1's accent, so the status bar icon is the academy's mint rather
      // than the system default.
      lightColor: '#A8D5BA',
    });
  } catch {
    // A channel that will not be created is a delivery problem on that phone,
    // not a reason to fail a cold start.
  }
}

/** D79: mobile only. Anything else has no push credentials and no store build. */
function currentPlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/**
 * The locale that goes on the row. Section 18: "Language for the payload comes
 * from the device row, not the sender", so this is the language the player is
 * actually reading the app in — the resolved i18next language, not the
 * device's system locale, because 16.1 lets him override it.
 */
export function currentPushLocale(): 'ar' | 'en' {
  const language = i18n.resolvedLanguage ?? i18n.language;
  return isLocale(language) ? language : DEFAULT_LOCALE;
}

/**
 * This phone's registration, or `null` when there is nothing to register:
 * permission not granted, no EAS project configured, an emulator with no push
 * support, or a platform that is neither iOS nor Android.
 *
 * Never throws. Every caller is a side effect running behind a screen the
 * player is already looking at.
 */
export async function acquireDeviceToken(): Promise<DeviceTokenRegistration | null> {
  const platform = currentPlatform();
  if (platform === null) return null;

  const projectId = config.easProjectId;
  if (projectId === '') return null;

  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return null;

    await ensureAndroidChannel();

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (typeof data !== 'string' || data.trim() === '') return null;

    return { token: data, platform, locale: currentPushLocale() };
  } catch {
    // A simulator, a device with no network, a revoked APNs key. None of these
    // is worth interrupting the player for.
    return null;
  }
}
