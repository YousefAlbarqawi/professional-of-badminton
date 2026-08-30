/**
 * Profile. BUILD-SPEC 14.12.
 *
 * What is deliberately absent matters as much as what is here: no tier, no
 * visibility level and no balance. 14.12 says so outright, D19 keeps a tier
 * away from a level 0 player, and A4 keeps balances coach-only. The query does
 * not fetch any of the three, so no future edit can put one on screen by
 * accident.
 *
 * The credits summary card 14.12 lists — "tappable through to subscriptions" —
 * is here. A30 deferred it from phase 2 because both the balance query and the
 * screen behind it (14.13) belong to phase 6; this is that phase.
 *
 * Its number is the sum of the credit ledger and nothing else (6.2, D56), and
 * it taps through to the screen that shows the rows it was summed from.
 *
 * ── One screen, two audiences ─────────────────────────────
 * A28 also mounts this under the staff *More* stack, so a coach can sign out
 * and delete his account. Three sections differ between the two, on direct
 * client instruction, and the role drives all three:
 *
 *   - credits and subscriptions: player only. A coach has no subscription to
 *     spend and no ledger to read, so the card and its destination are noise
 *     on his copy of the screen.
 *   - *Message the coach*: player only, for the obvious reason. This is the
 *     second exception D72 allows, alongside the welcome screen.
 *   - notification permission: staff only. The player's copy is gone; his
 *     phone's own settings are where a permission is granted or taken back,
 *     and a read-only status line beside a link to them earned no room.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CreditSummaryCard } from '@/components/domain';
import {
  Button,
  Card,
  Dialog,
  Icon,
  SkeletonCard,
  Text,
  WhatsAppButton,
  isolateLTR,
} from '@/components/primitives';
import { ErrorState } from '@/components/states';
import { useAuth } from '@/features/auth/AuthProvider';
import { useNotificationPermission } from '@/features/notifications/permissions';
import { useUpdatePreferredLocale } from '@/features/players/mutations';
import { useMyProfile } from '@/features/players/queries';
import { EXPIRY_WARNING_DAYS, daysUntilExpiry } from '@/features/subscriptions/creditLedger';
import { useMyCredits } from '@/features/subscriptions/queries';
import { ammanDayKey, nowInAmman } from '@/lib/time';
import { useChangeLanguage } from '@/i18n/useChangeLanguage';
import type { Locale } from '@/lib/money';
import { useTheme } from '@/theme';
import type { ProfileStackParamList } from '@/app/types';

import { LanguageSheet } from './LanguageSheet';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>;

const NOTIFICATION_LABEL_KEYS = {
  granted: 'profile.notificationsOn',
  denied: 'profile.notificationsOff',
  undetermined: 'profile.notificationsNotSet',
  unknown: 'profile.notificationsNotSet',
} as const;

interface DetailRowProps {
  label: string;
  value: string;
  /** Emails and phone numbers read left to right in both languages. 16.2. */
  isLTR?: boolean;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, isLTR = false }) => (
  <View>
    <Text variant="caption" tone="tertiary">
      {label}
    </Text>
    <Text variant="body">{isLTR ? isolateLTR(value) : value}</Text>
  </View>
);

export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { user, signOut } = useAuth();
  const profile = useMyProfile();
  const { changeLanguage, current } = useChangeLanguage();
  const updateLocale = useUpdatePreferredLocale();
  const notifications = useNotificationPermission();
  const credits = useMyCredits();
  const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isPickingLanguage, setIsPickingLanguage] = useState(false);

  // Undefined while the profile loads. Treated as "not staff" for that moment,
  // which is the safe way round: it hides a coach's notification card for a
  // beat rather than flashing a credits card at him.
  const isStaff = profile.data !== undefined && profile.data.role !== 'player';

  // The trailing chevron follows the *physical* layout, like every other
  // chevron in the app (see `BookingCard`): under a mirrored layout the end of
  // a row is its left edge, so the arrow points that way.
  const chevron = theme.isRTL ? 'chevron-back' : 'chevron-forward';

  const switchLanguage = useCallback(
    (locale: Locale): void => {
      // The device copy changes first, because it is the one that survives a
      // restart and a sign out. The profile copy follows and is allowed to fail
      // quietly — see useUpdatePreferredLocale.
      changeLanguage(locale);
      updateLocale.mutate(locale);
    },
    [changeLanguage, updateLocale],
  );

  const openLanguagePicker = useCallback((): void => setIsPickingLanguage(true), []);
  const closeLanguagePicker = useCallback((): void => setIsPickingLanguage(false), []);

  const confirmSignOut = useCallback((): void => {
    setIsSigningOut(true);
    void signOut().finally(() => {
      setIsSigningOut(false);
      setIsConfirmingSignOut(false);
    });
  }, [signOut]);

  const goToDeleteAccount = useCallback(
    (): void => navigation.navigate('DeleteAccount'),
    [navigation],
  );

  const goToSubscriptions = useCallback(
    (): void => navigation.navigate('Subscriptions'),
    [navigation],
  );

  const retry = useCallback((): void => {
    void profile.refetch();
  }, [profile]);

  const content = ((): React.ReactElement => {
    if (profile.isPending) {
      return (
        <View style={{ gap: theme.spacing.md }} testID="profile-loading">
          <SkeletonCard />
          <SkeletonCard />
        </View>
      );
    }

    if (profile.isError || profile.data === undefined) {
      return (
        <ErrorState
          message={t('profile.loadError')}
          onRetry={retry}
          isRetrying={profile.isFetching}
          testID="profile-error"
        />
      );
    }

    return (
      <Card testID="profile-details">
        <Text variant="heading">{t('profile.details')}</Text>
        <View style={{ gap: theme.spacing.sm }}>
          <DetailRow label={t('profile.name')} value={profile.data.fullName} />
          <DetailRow label={t('profile.email')} value={user?.email ?? ''} isLTR />
          <DetailRow label={t('profile.phone')} value={profile.data.phone ?? ''} isLTR />
        </View>
      </Card>
    );
  })();

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
      testID="profile-screen"
    >
      {content}

      {/* 14.12's credits card. It is rendered even at zero, because "you have
          no credits" is an answer to the question the card is there to answer,
          and the screen behind it explains why (14.13's empty state). A failed
          read hides the card rather than blocking the screen: it is one line
          of a profile, not the profile. */}
      {isStaff || credits.isPending || credits.isError || credits.data === undefined ? null : (
        <CreditSummaryCard
          total={credits.data.total}
          nextExpiry={credits.data.nextExpiry}
          isExpiringSoon={
            credits.data.nextExpiry !== null &&
            daysUntilExpiry(credits.data.nextExpiry, ammanDayKey(nowInAmman())) <
              EXPIRY_WARNING_DAYS
          }
          onPress={goToSubscriptions}
          testID="profile-credits"
        />
      )}

      <Card>
        <Text variant="heading">{t('language.label')}</Text>
        {/* States the language that is running and opens the picker. The
            chevron is what says it is a control rather than a read-only line —
            the same affordance the session rows use. */}
        <Pressable
          onPress={openLanguagePicker}
          accessibilityRole="button"
          accessibilityLabel={t('language.label')}
          accessibilityHint={t(current === 'ar' ? 'language.arabic' : 'language.english')}
          testID="profile-language-row"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            minHeight: theme.minTouchTarget,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radii.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.bgSurface,
          }}
        >
          <Text variant="body" style={{ flex: 1 }} testID="profile-language-current">
            {t(current === 'ar' ? 'language.arabic' : 'language.english')}
          </Text>
          <Icon name={chevron} size={18} color={theme.colors.textSecondary} />
        </Pressable>
      </Card>

      {isStaff ? (
        <Card>
          <Text variant="heading">{t('profile.notifications')}</Text>
          <Text variant="body" tone="secondary" testID="profile-notification-status">
            {t(NOTIFICATION_LABEL_KEYS[notifications.status])}
          </Text>
          {notifications.status === 'denied' ? (
            <>
              <Text variant="small" tone="tertiary">
                {t('profile.notificationsOffHint')}
              </Text>
              <Button
                label={t('profile.openSettings')}
                onPress={notifications.openSettings}
                variant="secondary"
                testID="profile-open-settings"
              />
            </>
          ) : null}
        </Card>
      ) : null}

      {isStaff ? null : <WhatsAppButton isFullWidth />}

      <Button
        label={t('auth.signOut')}
        onPress={() => setIsConfirmingSignOut(true)}
        variant="secondary"
        isFullWidth
        testID="profile-sign-out"
      />

      {/* 14.12: muted destructive, at the bottom. 23.3 also requires it to be
          within three taps of here — this is one.

          `alignSelf` has to be on the button, not on the row: `Button` sets
          its own `alignSelf` from `isFullWidth`, and 'flex-start' on a child
          overrides 'center' on the parent's `alignItems`, which is why this
          sat against the edge despite the wrapper. */}
      <View style={styles.deleteRow}>
        <Button
          label={t('profile.deleteAccount')}
          onPress={goToDeleteAccount}
          variant="ghost"
          style={styles.deleteButton}
          testID="profile-delete-account"
        />
      </View>

      <LanguageSheet
        isVisible={isPickingLanguage}
        current={current}
        onSelect={switchLanguage}
        onClose={closeLanguagePicker}
      />

      <Dialog
        isVisible={isConfirmingSignOut}
        title={t('auth.signOutTitle')}
        message={t('auth.signOutBody')}
        confirmLabel={t('auth.signOut')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmSignOut}
        onCancel={() => setIsConfirmingSignOut(false)}
        isConfirming={isSigningOut}
        testID="sign-out-dialog"
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  deleteRow: {
    alignItems: 'center',
  },
  deleteButton: {
    alignSelf: 'center',
    opacity: 0.7,
  },
});

export default ProfileScreen;
