/**
 * Answering a tap on a notification.
 * BUILD-SPEC section 18: "Deep links: waitlist → session detail; announcement
 * → announcement detail."
 *
 * ── The two ways a tap arrives ───────────────────────────
 * The app was running, and `addNotificationResponseReceivedListener` fires; or
 * the app was not running, and the tap is what launched it, in which case
 * `getLastNotificationResponseAsync` holds it. Both are handled, and the
 * second is why the navigator has to be ready before either is read — a cold
 * launch has a response waiting before there is a tree to navigate.
 *
 * ── Why the navigator is reached by ref ──────────────────
 * A listener is not a component. `src/app/navigationRef.ts` says the rest.
 *
 * Where the tap should land is decided by `deepLinks.ts`, which is pure. This
 * file does the navigating and nothing else, so the interesting half is
 * testable and this half is four lines.
 */
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

import { navigationRef } from '@/app/navigationRef';

import { notificationTarget } from './deepLinks';
import type { NavigationTree, NotificationTarget } from './types';

/**
 * A notification that arrives while the player is looking at the app shows as
 * a banner rather than being swallowed. Section 18's two triggers are both
 * things he would want to see immediately — a spot is claimed first-come
 * (D27), and an announcement is the coach talking.
 */
export const foregroundBehaviour: Notifications.NotificationBehavior = {
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: true,
  shouldSetBadge: false,
};

export function navigateToTarget(target: NotificationTarget): void {
  if (!navigationRef.isReady()) return;

  switch (target.tab) {
    case 'ScheduleTab':
      navigationRef.navigate('ScheduleTab', { screen: target.screen, params: target.params });
      return;
    case 'Announcements':
      navigationRef.navigate('Announcements', { screen: target.screen, params: target.params });
      return;
    case 'More':
      navigationRef.navigate('More', { screen: target.screen, params: target.params });
      return;
  }
}

/**
 * Wires both arrival paths for as long as the tree is mounted.
 *
 * `tree` comes from the signed-in profile's role, because the destination
 * differs between the two navigators and one of the four combinations has no
 * destination at all. See `deepLinks.ts`.
 */
export function useNotificationRouting(tree: NavigationTree | null): void {
  useEffect(() => {
    if (tree === null) return;

    let isMounted = true;

    const handle = (response: Notifications.NotificationResponse | null): void => {
      if (!isMounted || response === null) return;
      const target = notificationTarget(response.notification.request.content.data, tree);
      if (target !== null) navigateToTarget(target);
    };

    // The tap that launched the app, if there was one.
    void Notifications.getLastNotificationResponseAsync()
      .then(handle)
      .catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener(handle);

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [tree]);
}
