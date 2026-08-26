/**
 * What a notification carries, and where a tap on it lands.
 * BUILD-SPEC section 18.
 */

/**
 * The two triggers, and there are two. D70.
 *
 * These strings are the `data.type` the `send-push` edge function writes and
 * `push_job_kind` in migration 0034. All three have to agree, and the
 * integration suite asserts the enum has no third value.
 */
export type NotificationKind = 'waitlist_spot' | 'announcement';

/** Which navigator is currently mounted. 14.0 gives an account one, never both. */
export type NavigationTree = 'player' | 'admin';

/**
 * Where a tap should land, expressed as data rather than as a navigation call,
 * so the parsing can be a pure function and tested as one.
 *
 * Section 18: "waitlist → session detail; announcement → announcement detail".
 */
export type NotificationTarget =
  | {
      tree: 'player';
      tab: 'ScheduleTab';
      screen: 'SessionDetail';
      params: { sessionId: string };
    }
  | {
      tree: 'player';
      tab: 'Announcements';
      screen: 'AnnouncementDetail';
      params: { announcementId: string };
    }
  | {
      tree: 'admin';
      tab: 'More';
      screen: 'AnnouncementDetail';
      params: { announcementId: string };
    };

export interface DeviceTokenRegistration {
  token: string;
  platform: 'ios' | 'android';
  locale: 'ar' | 'en';
}
