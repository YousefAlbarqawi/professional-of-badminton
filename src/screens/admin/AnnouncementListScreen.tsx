/**
 * The staff announcement list. BUILD-SPEC 15.11, and the root of 14.0's More
 * stack.
 *
 * "List of published announcements with a compose button … Announcements can
 * be soft deleted, which does not recall the push."
 *
 * ── Why this is the More tab's root ──────────────────────
 * 14.0: "More (stack: Announcements → Reports [coach only] → Settings)."
 * Assumption A28 made it the profile stack in phase 2 "until phase 8 and 9
 * give it announcements and reports", and both have now arrived. Reports
 * (15.12) and Settings — 14.12's screen, where a staff account signs out and
 * deletes itself — are each one tap from here, which keeps account deletion
 * inside the three taps App Store guideline 5.1.1(v) allows (23.3).
 *
 * The reports button is shown to every staff account rather than to the coach
 * alone. 15.12 describes what an admin sees when he opens that tab — "a
 * permission denied state, and the API refuses the query as well" — so hiding
 * the button would replace a stated answer with a missing one, and would put
 * the boundary in this file instead of in the database where D73 lives.
 *
 * ── The delete dialog says what a delete cannot do ───────
 * 15.11's "does not recall the push" is a property of the world, not a
 * limitation to be apologised for later: a notification on somebody's lock
 * screen is gone from the app's reach the moment it is delivered. The
 * confirmation says so before he presses it, rather than leaving him to
 * discover it when a player asks about a message that is no longer in the
 * list.
 */
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AnnouncementCard } from '@/components/domain';
import { Button, Dialog, SkeletonCard, Text, Toast } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { announcementErrorMessageKey } from '@/features/announcements/errors';
import { useDeleteAnnouncement } from '@/features/announcements/mutations';
import { useAnnouncements } from '@/features/announcements/queries';
import { nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { MoreStackParamList } from '@/app/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'AnnouncementList'>;

const SKELETON_COUNT = 3;
const PREVIEW_LINES = 4;

export const AnnouncementListScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const announcements = useAnnouncements();
  const remove = useDeleteAnnouncement();

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);

  const refetch = useCallback((): void => {
    void announcements.refetch();
  }, [announcements]);

  const compose = useCallback((): void => {
    navigation.navigate('AnnouncementCompose');
  }, [navigation]);

  const openSettings = useCallback((): void => {
    navigation.navigate('Profile');
  }, [navigation]);

  const openReports = useCallback((): void => {
    navigation.navigate('Reports');
  }, [navigation]);

  const confirmDelete = useCallback((): void => {
    if (pendingDeleteId === null) return;
    remove.mutate(pendingDeleteId, {
      onSuccess: () => {
        setPendingDeleteId(null);
        setToast({ message: t('announcements.deleted'), isError: false });
      },
      onError: (error) => {
        setPendingDeleteId(null);
        setToast({ message: t(announcementErrorMessageKey(error)), isError: true });
      },
    });
  }, [pendingDeleteId, remove, t]);

  const header = (
    <View style={{ gap: theme.spacing.sm }}>
      <Button
        label={t('announcements.compose')}
        onPress={compose}
        isFullWidth
        testID="announcement-compose-button"
      />
      {/* 14.0's More stack: Announcements → Reports → Settings. D73 is
          enforced by the server, not by the presence of this button. */}
      <Button
        label={t('admin.reports.title')}
        onPress={openReports}
        variant="secondary"
        isFullWidth
        testID="announcement-reports-button"
      />
      {/* A28: More is also where a staff account reaches 14.12. */}
      <Button
        label={t('announcements.settings')}
        onPress={openSettings}
        variant="ghost"
        isFullWidth
        testID="announcement-settings-button"
      />
    </View>
  );

  if (announcements.isPending) {
    return (
      <View
        testID="admin-announcements-loading"
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        {header}
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </View>
    );
  }

  if (announcements.isError) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        {header}
        <ErrorState
          message={t(announcementErrorMessageKey(announcements.error))}
          onRetry={refetch}
          isRetrying={announcements.isFetching}
          testID="admin-announcements-error"
        />
      </View>
    );
  }

  const now = nowInAmman();
  const rows = announcements.data;

  return (
    <>
      <ScrollView
        testID="admin-announcements"
        style={{ backgroundColor: theme.colors.bg }}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={announcements.isFetching}
            onRefresh={refetch}
            tintColor={theme.colors.textSecondary}
          />
        }
      >
        {header}

        {rows.length === 0 ? (
          <EmptyState
            message={t('announcements.empty')}
            showWhatsApp={false}
            testID="admin-announcements-empty"
          />
        ) : (
          rows.map((announcement) => (
            <View key={announcement.id} style={{ gap: theme.spacing.xs }}>
              <AnnouncementCard
                announcement={announcement}
                now={now}
                isUnread={false}
                onPress={() =>
                  navigation.navigate('AnnouncementDetail', { announcementId: announcement.id })
                }
                onDelete={() => setPendingDeleteId(announcement.id)}
                numberOfLines={PREVIEW_LINES}
                testID={`admin-announcement-${announcement.id}`}
              />
              {/* Whether the outbox has actually sent it yet. Section 18 puts
                  the sending behind a drain, so "posted" and "delivered" are
                  minutes apart at worst and the coach can see which he is
                  looking at. */}
              <Text variant="caption" tone="tertiary">
                {announcement.pushSentAt === null
                  ? t('announcements.pushPending')
                  : t('announcements.pushSent')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <Dialog
        isVisible={pendingDeleteId !== null}
        title={t('announcements.deleteTitle')}
        message={t('announcements.deleteBody')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
        isConfirming={remove.isPending}
        isDestructive
        testID="announcement-delete-dialog"
      />

      <Toast
        isVisible={toast !== null}
        message={toast?.message ?? ''}
        tone={toast?.isError === true ? 'danger' : 'neutral'}
        onDismiss={() => setToast(null)}
        testID="announcement-toast"
      />
    </>
  );
};

export default AnnouncementListScreen;
