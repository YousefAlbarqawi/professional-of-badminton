/**
 * The one decision this file makes: which of the three trees to show.
 * BUILD-SPEC 14.0.
 *
 *   no session          → AuthNavigator
 *   role = player       → PlayerNavigator
 *   role = assistant_coach | admin | coach → AdminNavigator
 *
 * The role comes from the profiles row, read under RLS, not from anything the
 * client can assert. Showing the admin tabs to a player would be a cosmetic
 * mistake rather than a breach — every table behind them refuses him — but it
 * is still a mistake, so the tree waits for the real answer.
 *
 * Two of section 18's obligations also live here, because this is the one
 * component that is mounted for exactly as long as somebody is signed in:
 * registering this device's push token on login and on every cold start, and
 * answering a tap on a notification. The second needs the role too — the two
 * trees keep announcements in different places, and a waitlist push has no
 * destination on the staff side at all.
 */
import React, { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/primitives';
import { ErrorState } from '@/components/states';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDeviceTokenRegistration } from '@/features/notifications/registration';
import { useNotificationRouting } from '@/features/notifications/routing';
import { useMyProfile } from '@/features/players/queries';
import { colors } from '@/theme';

import { AdminNavigator } from './AdminNavigator';
import { AuthNavigator } from './AuthNavigator';
import { PlayerNavigator } from './PlayerNavigator';

const Centred: React.FC<{ children: React.ReactNode; testID?: string }> = ({
  children,
  testID,
}) => (
  <View
    testID={testID}
    style={{
      flex: 1,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 24,
    }}
  >
    {children}
  </View>
);

export const RootNavigator: React.FC = () => {
  const { t } = useTranslation();
  const { status, signOut } = useAuth();
  const profile = useMyProfile();

  // Section 18: "Tokens registered on login and refreshed on every cold
  // start." Neither is a user action and neither has a visible outcome, so
  // both are effects rather than anything the tree waits on.
  useDeviceTokenRegistration();
  useNotificationRouting(
    profile.data === undefined ? null : profile.data.role === 'player' ? 'player' : 'admin',
  );

  const retry = useCallback((): void => {
    void profile.refetch();
  }, [profile]);

  const handleSignOut = useCallback((): void => {
    void signOut();
  }, [signOut]);

  if (status === 'loading') {
    return (
      <Centred testID="root-restoring-session">
        <ActivityIndicator color={colors.accent} accessibilityLabel={t('common.loading')} />
      </Centred>
    );
  }

  if (status === 'signed_out') {
    return <AuthNavigator />;
  }

  if (profile.isPending) {
    return (
      <Centred testID="root-loading-profile">
        <ActivityIndicator color={colors.accent} accessibilityLabel={t('common.loading')} />
      </Centred>
    );
  }

  // A session with no readable profile is a dead end: nothing can be shown and
  // no tree is the right one. Signing out is the way back to a usable app.
  if (profile.isError || profile.data === undefined) {
    return (
      <Centred testID="root-profile-error">
        <ErrorState
          message={t('profile.loadError')}
          onRetry={retry}
          isRetrying={profile.isFetching}
        />
        <Button label={t('auth.signOut')} onPress={handleSignOut} variant="ghost" />
      </Centred>
    );
  }

  return profile.data.role === 'player' ? <PlayerNavigator /> : <AdminNavigator />;
};

export default RootNavigator;
