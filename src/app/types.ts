/**
 * The navigation tree, typed. BUILD-SPEC 14.0.
 *
 * Route params carry only what a screen needs to render. Nothing secret ever
 * becomes a param: React Navigation keeps params in a serialisable state tree,
 * so a password there would be one persistence flag away from disk. The
 * pending sign-up credentials live in a context instead — see
 * `features/auth/pendingVerification`.
 */
import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: { email?: string } | undefined;
  SignUp: undefined;
  VerifyEmail: { email: string };
  ForgotPassword: { email?: string } | undefined;
};

export type ProfileStackParamList = {
  Profile: undefined;
  DeleteAccount: undefined;
  /** 14.13, reached from 14.12's credits card. A30. */
  Subscriptions: undefined;
};

/**
 * The three staff screens that hang off one player, shared by two stacks.
 *
 * 14.0 puts them under the Players tab —
 * `PlayerList → PlayerProfile → GrantSubscription → AdjustCredits` — and phase
 * 5 also reached the profile from the money tab, because that is where a debt
 * is created. Rather than declare the trio twice and let the two copies drift,
 * both stacks spread this in, and the screens themselves are typed against it.
 */
export type PlayerAdminRoutes = {
  PlayerProfile: { playerId: string };
  /** 15.9. */
  GrantSubscription: { playerId: string };
  /** 15.10. The subscription may be preselected from the card he tapped. */
  AdjustCredits: { playerId: string; subscriptionId?: string };
};

/**
 * 14.0: Schedule (stack: ScheduleList → SessionDetail → BookingConfirm).
 *
 * There is no `BookingConfirm` route. 14.8 opens with "A bottom sheet, not a
 * screen", and a route cannot sit over the session summary the player is
 * deciding from. The sheet is rendered by SessionDetail instead.
 */
export type ScheduleStackParamList = {
  ScheduleList: undefined;
  SessionDetail: { sessionId: string };
};

/** 14.0: MyBookings (stack: BookingList → BookingDetail). */
export type MyBookingsStackParamList = {
  BookingList: undefined;
  BookingDetail: { bookingId: string };
};

/**
 * 14.11. A list and a detail view, so the tab is a stack rather than the bare
 * screen phase 2 reserved.
 *
 * The detail route is also section 18's deep link target for an announcement
 * push, which is why the id is a param rather than a selection held in the
 * list's state: the notification carries it, and the app may be opening cold.
 */
export type AnnouncementsStackParamList = {
  AnnouncementList: undefined;
  AnnouncementDetail: { announcementId: string };
};

export type PlayerTabParamList = {
  ScheduleTab: NavigatorScreenParams<ScheduleStackParamList> | undefined;
  MyBookingsTab: NavigatorScreenParams<MyBookingsStackParamList> | undefined;
  Announcements: NavigatorScreenParams<AnnouncementsStackParamList> | undefined;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

/** 14.0: Today (stack: TodayList → SessionManage → CourtBoard → Review). */
export type TodayStackParamList = {
  TodayList: undefined;
  /**
   * 15.2's three tabs. `tab` exists for 15.1's *Court board* shortcut, which
   * has to land on the board rather than on the roster; everything else opens
   * on Players.
   */
  SessionManage: { sessionId: string; tab?: 'players' | 'courtBoard' | 'money' };
} & PlayerAdminRoutes;

/** 14.0: Players (stack: PlayerList → PlayerProfile → GrantSubscription → AdjustCredits). */
export type PlayersStackParamList = {
  /** 15.7. */
  PlayerList: undefined;
} & PlayerAdminRoutes;

/**
 * 14.0: Schedule (stack: AdminSchedule → SessionEdit → CreateSession).
 *
 * `CreateSession` takes an optional prefill so 15.3's *Duplicate* row action
 * can be a prefilled create rather than a fourth code path. Everything is a
 * string or a number, because params are serialised.
 */
export type AdminScheduleStackParamList = {
  AdminScheduleList: undefined;
  SessionEdit: { sessionId: string };
  CreateSession:
    | {
        venueId?: string;
        sessionDate?: string;
        startTime?: string;
        durationMinutes?: 90 | 150;
        priceJD?: string;
        courtCount?: number;
      }
    | undefined;
};

/**
 * 14.0: More (stack: Announcements → Reports [coach only] → Settings).
 *
 * A28 made this the profile stack "until phase 8 and 9 give it announcements
 * and reports", and phase 8 is now. `AnnouncementList` is the root, as 14.0
 * has it, and Settings — 14.12's screen, which is where a staff account signs
 * out and deletes itself — is one level in from it. That keeps account
 * deletion within the three taps App Store guideline 5.1.1(v) allows (23.3).
 *
 * `AnnouncementCompose` predates the rest: 9.4 step 6 needed somewhere to send
 * the coach after he cancels a session, carrying the prefilled body. Its param
 * is unchanged, and the composer now reads it.
 */
export type MoreStackParamList = {
  /** 15.11's list, with the compose button. */
  AnnouncementList: undefined;
  /** Shared with the player tree by shape; section 18's deep link target. */
  AnnouncementDetail: { announcementId: string };
  AnnouncementCompose: { draftBody?: string } | undefined;
  /**
   * 15.12, and D73's boundary made visible. Registered for every staff account
   * rather than for the coach alone: 15.12 says an admin opening this tab
   * "sees a permission denied state", which needs the tab to open. The refusal
   * itself comes from the server (migration 0036), not from this table.
   */
  Reports: undefined;
  /** 14.12, reached from the list. A28. */
  Profile: undefined;
  DeleteAccount: undefined;
  /**
   * A28 makes More the staff profile stack, and 14.12 is one screen for
   * everybody. A coach may hold a subscription like anyone else, so the route
   * he taps through to has to exist on his side of the app as well.
   */
  Subscriptions: undefined;
};

/**
 * D16 and A14. An assistant coach reaches these tabs too, with far less inside
 * them; RLS is what actually stops him, not the absence of a tab.
 */
export type AdminTabParamList = {
  Today: NavigatorScreenParams<TodayStackParamList> | undefined;
  AdminSchedule: NavigatorScreenParams<AdminScheduleStackParamList> | undefined;
  Players: NavigatorScreenParams<PlayersStackParamList> | undefined;
  More: NavigatorScreenParams<MoreStackParamList> | undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  Player: NavigatorScreenParams<PlayerTabParamList> | undefined;
  Admin: NavigatorScreenParams<AdminTabParamList> | undefined;
};
