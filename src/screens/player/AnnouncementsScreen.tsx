/**
 * The player's announcements. BUILD-SPEC 14.11.
 *
 * "Reverse chronological list of announcement bodies with relative timestamps
 * … Tapping opens a detail view with selectable text and a WhatsApp button.
 * Unread ones carry a dot; read state is local to the device."
 *
 * The order comes from the query, the direction from each message's own
 * content, and the read state from AsyncStorage — see
 * `features/announcements/readState.ts` for why it is not a column.
 *
 * D72 puts the WhatsApp affordance on the empty and error states as well as
 * the populated one.
 */
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AnnouncementCard } from '@/components/domain';
import { SkeletonCard, WhatsAppButton } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { useAnnouncements } from '@/features/announcements/queries';
import { useAnnouncementReadState } from '@/features/announcements/readState';
import { isOfflineError } from '@/features/sessions/errors';
import { nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { AnnouncementsStackParamList } from '@/app/types';

type Props = NativeStackScreenProps<AnnouncementsStackParamList, 'AnnouncementList'>;

const SKELETON_COUNT = 3;

/** How much of a long notice the list shows before it needs opening. */
const PREVIEW_LINES = 4;

export const AnnouncementsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const announcements = useAnnouncements();
  const readState = useAnnouncementReadState();

  const refetch = useCallback((): void => {
    void announcements.refetch();
  }, [announcements]);

  const open = useCallback(
    (announcementId: string): void => {
      readState.markRead(announcementId);
      navigation.navigate('AnnouncementDetail', { announcementId });
    },
    [navigation, readState],
  );

  if (announcements.isPending) {
    return (
      <View
        testID="announcements-loading"
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
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
        <ErrorState
          message={
            isOfflineError(announcements.error)
              ? t('schedule.offlineBanner')
              : t('announcements.loadError')
          }
          onRetry={refetch}
          isRetrying={announcements.isFetching}
          testID="announcements-error"
        />
      </View>
    );
  }

  const now = nowInAmman();
  const rows = announcements.data;

  return (
    <ScrollView
      testID="announcements-list"
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
      {rows.length === 0 ? (
        // EmptyState and ErrorState both carry the WhatsApp button already
        // (D72), so the standalone one below is for the populated list.
        <EmptyState message={t('announcements.empty')} testID="announcements-empty" />
      ) : (
        rows.map((announcement) => (
          <AnnouncementCard
            key={announcement.id}
            announcement={announcement}
            now={now}
            // While the stored list is still loading, nothing is marked
            // unread: a dot that appears and then vanishes is worse than one
            // that arrives a moment late.
            isUnread={!readState.isLoading && !readState.isRead(announcement.id)}
            onPress={() => open(announcement.id)}
            numberOfLines={PREVIEW_LINES}
            testID={`announcement-${announcement.id}`}
          />
        ))
      )}

      {rows.length === 0 ? null : <WhatsAppButton />}
    </ScrollView>
  );
};

export default AnnouncementsScreen;
