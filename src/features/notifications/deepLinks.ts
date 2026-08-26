/**
 * Reading a notification's payload and deciding where the tap goes.
 * BUILD-SPEC section 18: "Deep links: waitlist → session detail; announcement
 * → announcement detail."
 *
 * Pure, so it can be tested without a device and without a navigator. The
 * caller does the navigating.
 *
 * ── Why the payload is treated as untrusted ──────────────
 * It arrives from outside the app through the OS. The server writes it and
 * nothing else can, but by the time it reaches here it has been through two
 * push services and a serialisation, so it is parsed rather than cast: an id
 * that is not a string, or a type that is neither of the two, produces `null`
 * and the app simply opens where it was.
 */
import type { NavigationTree, NotificationTarget } from './types';

function readString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Where this notification should land, or `null` when it should land nowhere.
 *
 * `tree` is which navigator is mounted, from the profile's role. It matters
 * because the two trees keep announcements in different places — the player's
 * own tab (14.11), the staff More stack (15.11) — and because a waitlist push
 * has no destination at all on the staff side: 14.7's session detail is a
 * player screen, and a staff account reaches a session through 15.2 instead.
 * Rather than send a coach somewhere that is not the screen the notification
 * is about, that combination opens nothing.
 */
export function notificationTarget(
  payload: unknown,
  tree: NavigationTree,
): NotificationTarget | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = payload as Record<string, unknown>;

  switch (data.type) {
    case 'waitlist_spot': {
      if (tree !== 'player') return null;
      const sessionId = readString(data, 'sessionId');
      if (sessionId === null) return null;
      return { tree: 'player', tab: 'ScheduleTab', screen: 'SessionDetail', params: { sessionId } };
    }

    case 'announcement': {
      const announcementId = readString(data, 'announcementId');
      if (announcementId === null) return null;
      return tree === 'player'
        ? {
            tree: 'player',
            tab: 'Announcements',
            screen: 'AnnouncementDetail',
            params: { announcementId },
          }
        : {
            tree: 'admin',
            tab: 'More',
            screen: 'AnnouncementDetail',
            params: { announcementId },
          };
    }

    default:
      return null;
  }
}
