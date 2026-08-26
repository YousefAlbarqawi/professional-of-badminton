/**
 * The staff tabs. BUILD-SPEC 14.0, reached by coach, admin and assistant coach.
 *
 * Today, Schedule and Players are built. Session manage has its players tab
 * from phase 4, its money tab from phase 5 and its court board from phase 7.
 *
 * More is now 14.0's More in full: its root is 15.11's announcement list, with
 * the composer and the detail view behind it, 15.12's reports one tap in, and
 * 14.12's profile — where a staff account signs out and deletes itself — one
 * tap in as well. A28 said announcements would arrive in phase 8 and reports
 * in phase 9, and both have.
 *
 * The Players stack is 14.0's, in full: PlayerList → PlayerProfile →
 * GrantSubscription → AdjustCredits. The profile and the two subscription
 * screens also sit in the Today stack, because phase 5 reaches the profile by
 * tapping a name on the review screen and the coach must be able to grant from
 * there too. Both stacks spread `PlayerAdminRoutes` so the two copies of that
 * trio cannot drift apart.
 *
 * A14 gives an assistant coach far less than an admin. That difference is
 * enforced by RLS rather than by hiding a tab, exactly as 14.0 requires, and
 * lands with the screens themselves in later phases.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AdjustCreditsScreen } from '@/screens/admin/AdjustCreditsScreen';
import { AnnouncementComposeScreen } from '@/screens/admin/AnnouncementComposeScreen';
import { AnnouncementListScreen } from '@/screens/admin/AnnouncementListScreen';
import { AdminScheduleScreen } from '@/screens/admin/AdminScheduleScreen';
import { CreateSessionScreen } from '@/screens/admin/CreateSessionScreen';
import { GrantSubscriptionScreen } from '@/screens/admin/GrantSubscriptionScreen';
import { SessionEditScreen } from '@/screens/admin/SessionEditScreen';
import { PlayerListScreen } from '@/screens/admin/PlayerListScreen';
import { PlayerProfileScreen } from '@/screens/admin/PlayerProfileScreen';
import { ReportsScreen } from '@/screens/admin/ReportsScreen';
import { SessionManageScreen } from '@/screens/admin/SessionManageScreen';
import { TodayScreen } from '@/screens/admin/TodayScreen';
import { AnnouncementDetailScreen } from '@/screens/player/AnnouncementDetailScreen';
import { DeleteAccountScreen } from '@/screens/player/DeleteAccountScreen';
import { ProfileScreen } from '@/screens/player/ProfileScreen';
import { SubscriptionsScreen } from '@/screens/player/SubscriptionsScreen';
import { colors } from '@/theme';

import type {
  AdminScheduleStackParamList,
  AdminTabParamList,
  MoreStackParamList,
  PlayersStackParamList,
  TodayStackParamList,
} from './types';

const Tabs = createBottomTabNavigator<AdminTabParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();
const TodayStack = createNativeStackNavigator<TodayStackParamList>();
const ScheduleStack = createNativeStackNavigator<AdminScheduleStackParamList>();
const PlayersStack = createNativeStackNavigator<PlayersStackParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.textPrimary,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
  headerBackButtonDisplayMode: 'minimal',
} as const;

const TodayNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <TodayStack.Navigator screenOptions={stackScreenOptions}>
      <TodayStack.Screen
        name="TodayList"
        component={TodayScreen}
        options={{ title: t('admin.today.title') }}
      />
      {/* 15.2. Players and money are built; the court board names its phase. */}
      <TodayStack.Screen
        name="SessionManage"
        component={SessionManageScreen}
        options={{ title: t('admin.manage.title') }}
      />
      {/* 15.8, sections 1, 5 and 6. Reached from the money tab, because that
          is where the debt the coach wants to look at was created. */}
      <TodayStack.Screen
        name="PlayerProfile"
        component={PlayerProfileScreen}
        options={{ title: t('admin.profile.title') }}
      />
      <TodayStack.Screen
        name="GrantSubscription"
        component={GrantSubscriptionScreen}
        options={{ title: t('admin.subs.grantTitle') }}
      />
      <TodayStack.Screen
        name="AdjustCredits"
        component={AdjustCreditsScreen}
        options={{ title: t('admin.subs.adjustTitle') }}
      />
    </TodayStack.Navigator>
  );
};

const AdminScheduleNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <ScheduleStack.Navigator screenOptions={stackScreenOptions}>
      <ScheduleStack.Screen
        name="AdminScheduleList"
        component={AdminScheduleScreen}
        options={{ title: t('admin.schedule.title') }}
      />
      <ScheduleStack.Screen
        name="SessionEdit"
        component={SessionEditScreen}
        options={{ title: t('admin.edit.title') }}
      />
      <ScheduleStack.Screen
        name="CreateSession"
        component={CreateSessionScreen}
        options={{ title: t('admin.create.title') }}
      />
    </ScheduleStack.Navigator>
  );
};

/** 14.0: Players (stack: PlayerList → PlayerProfile → GrantSubscription → AdjustCredits). */
const PlayersNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <PlayersStack.Navigator screenOptions={stackScreenOptions}>
      <PlayersStack.Screen
        name="PlayerList"
        component={PlayerListScreen}
        options={{ title: t('admin.players.title') }}
      />
      <PlayersStack.Screen
        name="PlayerProfile"
        component={PlayerProfileScreen}
        options={{ title: t('admin.profile.title') }}
      />
      <PlayersStack.Screen
        name="GrantSubscription"
        component={GrantSubscriptionScreen}
        options={{ title: t('admin.subs.grantTitle') }}
      />
      <PlayersStack.Screen
        name="AdjustCredits"
        component={AdjustCreditsScreen}
        options={{ title: t('admin.subs.adjustTitle') }}
      />
    </PlayersStack.Navigator>
  );
};

const MoreNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <MoreStack.Navigator screenOptions={stackScreenOptions}>
      {/* 14.0's More stack opens on Announcements. 15.11. */}
      <MoreStack.Screen
        name="AnnouncementList"
        component={AnnouncementListScreen}
        options={{ title: t('announcements.title') }}
      />
      <MoreStack.Screen
        name="AnnouncementDetail"
        component={AnnouncementDetailScreen}
        options={{ title: t('announcements.detailTitle') }}
      />
      {/* 9.4 step 6 hands this route a prefilled body after a cancellation. */}
      <MoreStack.Screen
        name="AnnouncementCompose"
        component={AnnouncementComposeScreen}
        options={{ title: t('announcements.composeTitle') }}
      />
      {/* 14.0: "More (stack: Announcements → Reports [coach only] → Settings)."
          The route exists for every staff account so that an admin who taps it
          gets 15.12's permission denied state; the API refuses him too. */}
      <MoreStack.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ title: t('admin.reports.title') }}
      />
      {/* A28: More is also the staff profile stack, so a coach can sign out
          and delete his account. 23.3 wants that within three taps. */}
      <MoreStack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: t('profile.title') }}
      />
      <MoreStack.Screen
        name="Subscriptions"
        component={SubscriptionsScreen}
        options={{ title: t('subscriptions.title') }}
      />
      <MoreStack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: t('deleteAccount.title') }}
      />
    </MoreStack.Navigator>
  );
};

export const AdminNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.bgElevated, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="Today"
        component={TodayNavigator}
        options={{ title: t('tabs.today'), headerShown: false }}
      />
      <Tabs.Screen
        name="AdminSchedule"
        component={AdminScheduleNavigator}
        options={{ title: t('tabs.schedule'), headerShown: false }}
      />
      <Tabs.Screen
        name="Players"
        component={PlayersNavigator}
        options={{ title: t('tabs.players'), headerShown: false }}
      />
      <Tabs.Screen
        name="More"
        component={MoreNavigator}
        options={{ title: t('tabs.more'), headerShown: false }}
      />
    </Tabs.Navigator>
  );
};

export default AdminNavigator;
