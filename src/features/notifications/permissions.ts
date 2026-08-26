/**
 * Notification permission.
 *
 * Section 18: "Permission is requested contextually, the first time the player
 * joins a waiting list, not on first launch." Phase 3 needed only the read, so
 * that is all this held; phase 4 builds the waiting list, which is the moment
 * the request belongs to, so `requestNotificationPermission` lands with it.
 *
 * If he says no, the waiting list still works and the app says so plainly —
 * section 18 again, and `notifications.enablePrompt` in the deck. Nothing here
 * blocks a join on an answer.
 *
 * Registering device tokens and sending anything is still phase 8.
 */
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';

export type NotificationPermission = 'unknown' | 'granted' | 'denied' | 'undetermined';

export interface NotificationPermissionState {
  status: NotificationPermission;
  /** Opens the app's own page in the system settings. */
  openSettings: () => void;
  refresh: () => void;
}

export function useNotificationPermission(): NotificationPermissionState {
  const [status, setStatus] = useState<NotificationPermission>('unknown');

  const refresh = useCallback((): void => {
    void Notifications.getPermissionsAsync()
      .then((result) => {
        if (result.granted) {
          setStatus('granted');
          return;
        }
        setStatus(result.canAskAgain ? 'undetermined' : 'denied');
      })
      // A device that will not answer is not a reason to break the screen.
      .catch(() => setStatus('unknown'));
  }, []);

  useEffect(refresh, [refresh]);

  const openSettings = useCallback((): void => {
    void Linking.openSettings();
  }, []);

  return { status, openSettings, refresh };
}

/**
 * Asks, once, at the moment section 18 says to ask: the player has just joined
 * a waiting list and a notification is now the only way he hears about a spot.
 *
 * Resolves to whether he agreed. It never throws: a device that will not answer
 * is not a reason to fail a join that has already succeeded.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    // Asking again after a refusal shows nothing on either platform, so this
    // is the difference between a prompt and a silent no-op.
    if (!current.canAskAgain) return false;

    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}
