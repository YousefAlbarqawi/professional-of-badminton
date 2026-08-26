/**
 * Registering this device, at the two moments section 18 names.
 *
 * "Tokens registered on login and refreshed on every cold start, stored in
 * `device_tokens` with the device's locale."
 *
 * ── The two moments, and a third ─────────────────────────
 * Cold start and login are the same event to this hook: it runs when a signed
 * in account first has a profile, and again whenever that account changes. A
 * cold start mounts the tree fresh, so the effect runs; a login swaps the tree,
 * so it runs again with the new id.
 *
 * The third is the locale. Section 18 puts the payload's language on the device
 * row, so a player who switches to English (16.1) and then hears about a spot
 * should hear about it in English. Changing language reloads the app on
 * Android (`I18nManager.forceRTL`), which is a cold start — but not on iOS in
 * every case, so the locale is a dependency here rather than a thing assumed
 * to arrive with a restart.
 *
 * ── Why it is not a mutation hook ────────────────────────
 * Nothing on a screen is waiting for it and nothing is invalidated by it. It
 * is a side effect with no user-visible outcome either way, so it is an effect
 * and a ref rather than TanStack state. A failure is logged and retried at the
 * next cold start; there is nothing useful to tell the player, who did not ask
 * for this and cannot fix it.
 */
import { useEffect, useRef } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme';

import { registerDeviceToken } from './api';
import { acquireDeviceToken } from './deviceToken';

/**
 * Acquires and stores the token, once, for whoever is signed in.
 *
 * Exported on its own as well as through the hook because the waiting list
 * join calls it directly: a player who has just granted permission (18) has a
 * token available for the first time, and waiting for the next cold start to
 * register it would mean missing the very spot he joined the list for.
 */
export async function syncDeviceToken(): Promise<boolean> {
  const registration = await acquireDeviceToken();
  if (registration === null) return false;

  try {
    await registerDeviceToken(registration);
    return true;
  } catch (error) {
    console.warn('device token registration failed', error);
    return false;
  }
}

export function useDeviceTokenRegistration(): void {
  const { user } = useAuth();
  const { locale } = useTheme();
  const userId = user?.id ?? null;

  // One registration per (account, locale). Without this, every re-render that
  // changed the auth object would fire another round trip.
  const lastSynced = useRef<string | null>(null);

  useEffect(() => {
    if (userId === null) {
      lastSynced.current = null;
      return;
    }

    const key = `${userId}:${locale}`;
    if (lastSynced.current === key) return;
    lastSynced.current = key;

    void syncDeviceToken().then((registered) => {
      // A phone that had nothing to register — permission not granted yet —
      // must be allowed to try again once it has.
      if (!registered) lastSynced.current = null;
    });
  }, [locale, userId]);
}
