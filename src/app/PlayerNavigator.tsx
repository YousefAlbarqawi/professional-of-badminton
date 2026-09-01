/**
 * The player's tabs. BUILD-SPEC 14.0.
 *
 * Schedule, MyBookings, Announcements and Profile. All four are built;
 * Announcements is 14.11 and arrived with phase 8.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';

import { Icon, type IconName } from '@/components/primitives';
import { AnnouncementDetailScreen } from '@/screens/player/AnnouncementDetailScreen';
import { AnnouncementsScreen } from '@/screens/player/AnnouncementsScreen';
import { BookingDetailScreen } from '@/screens/player/BookingDetailScreen';
import { DeleteAccountScreen } from '@/screens/player/DeleteAccountScreen';
import { MyBookingsScreen } from '@/screens/player/MyBookingsScreen';
import { ProfileScreen } from '@/screens/player/ProfileScreen';
import { SubscriptionsScreen } from '@/screens/player/SubscriptionsScreen';
import { ScheduleScreen } from '@/screens/player/ScheduleScreen';
import { SessionDetailScreen } from '@/screens/player/SessionDetailScreen';
import { colors } from '@/theme';

import { ScreenHeader } from './ScreenHeader';
import type {
  AnnouncementsStackParamList,
  MyBookingsStackParamList,
  PlayerTabParamList,
  ProfileStackParamList,
  ScheduleStackParamList,
} from './types';

const TAB_ICONS: Record<keyof PlayerTabParamList, { active: IconName; inactive: IconName }> = {
  ScheduleTab: { active: 'calendar', inactive: 'calendar-outline' },
  MyBookingsTab: { active: 'bookmark', inactive: 'bookmark-outline' },
  Announcements: { active: 'megaphone', inactive: 'megaphone-outline' },
  ProfileTab: { active: 'person-circle', inactive: 'person-circle-outline' },
};

function makeTabBarIcon(
  tab: keyof PlayerTabParamList,
): (props: { focused: boolean; color: string; size: number }) => React.ReactElement {
  function TabBarIcon({
    focused,
    color,
    size,
  }: {
    focused: boolean;
    color: string;
    size: number;
  }): React.ReactElement {
    return (
      <Icon
        name={focused ? TAB_ICONS[tab].active : TAB_ICONS[tab].inactive}
        color={color}
        size={size}
      />
    );
  }
  return TabBarIcon;
}

const Tabs = createBottomTabNavigator<PlayerTabParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const ScheduleStack = createNativeStackNavigator<ScheduleStackParamList>();
const BookingsStack = createNativeStackNavigator<MyBookingsStackParamList>();
const AnnouncementsStack = createNativeStackNavigator<AnnouncementsStackParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.textPrimary,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
  headerBackButtonDisplayMode: 'minimal',
  // The whole bar is drawn by React Native, not UIKit. See ScreenHeader.
  header: (props: NativeStackHeaderProps) => <ScreenHeader {...props} />,
} as const;

const ScheduleNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <ScheduleStack.Navigator screenOptions={stackScreenOptions}>
      <ScheduleStack.Screen
        name="ScheduleList"
        component={ScheduleScreen}
        options={{ title: t('schedule.title') }}
      />
      <ScheduleStack.Screen
        name="SessionDetail"
        component={SessionDetailScreen}
        options={{ title: t('session.title') }}
      />
    </ScheduleStack.Navigator>
  );
};

/** 14.9 and 14.10. */
const MyBookingsNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <BookingsStack.Navigator screenOptions={stackScreenOptions}>
      <BookingsStack.Screen
        name="BookingList"
        component={MyBookingsScreen}
        options={{ title: t('bookings.title') }}
      />
      <BookingsStack.Screen
        name="BookingDetail"
        component={BookingDetailScreen}
        options={{ title: t('bookings.detailTitle') }}
      />
    </BookingsStack.Navigator>
  );
};

/** 14.11, and section 18's deep link destination for an announcement push. */
const AnnouncementsNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <AnnouncementsStack.Navigator screenOptions={stackScreenOptions}>
      <AnnouncementsStack.Screen
        name="AnnouncementList"
        component={AnnouncementsScreen}
        options={{ title: t('announcements.title') }}
      />
      <AnnouncementsStack.Screen
        name="AnnouncementDetail"
        component={AnnouncementDetailScreen}
        options={{ title: t('announcements.detailTitle') }}
      />
    </AnnouncementsStack.Navigator>
  );
};

const ProfileNavigator: React.FC = () => {
  const { t } = useTranslation();

  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: t('profile.title') }}
      />
      {/* 14.13, reached from 14.12's credits card. A30. */}
      <ProfileStack.Screen
        name="Subscriptions"
        component={SubscriptionsScreen}
        options={{ title: t('subscriptions.title') }}
      />
      <ProfileStack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: t('deleteAccount.title') }}
      />
    </ProfileStack.Navigator>
  );
};

export const PlayerNavigator: React.FC = () => {
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
        name="ScheduleTab"
        component={ScheduleNavigator}
        options={{
          title: t('tabs.schedule'),
          headerShown: false,
          tabBarIcon: makeTabBarIcon('ScheduleTab'),
        }}
      />
      <Tabs.Screen
        name="MyBookingsTab"
        component={MyBookingsNavigator}
        options={{
          title: t('tabs.bookings'),
          headerShown: false,
          tabBarIcon: makeTabBarIcon('MyBookingsTab'),
        }}
      />
      <Tabs.Screen
        name="Announcements"
        component={AnnouncementsNavigator}
        options={{
          title: t('tabs.announcements'),
          headerShown: false,
          tabBarIcon: makeTabBarIcon('Announcements'),
        }}
      />
      <Tabs.Screen
        name="ProfileTab"
        component={ProfileNavigator}
        options={{
          title: t('tabs.profile'),
          headerShown: false,
          tabBarIcon: makeTabBarIcon('ProfileTab'),
        }}
      />
    </Tabs.Navigator>
  );
};

export default PlayerNavigator;
