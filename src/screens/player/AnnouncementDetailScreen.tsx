/**
 * One announcement, in full. BUILD-SPEC 14.11.
 *
 * "Tapping opens a detail view with selectable text and a WhatsApp button."
 *
 * Selectable because an announcement is the one place in the app where the
 * coach might put a CliQ reference, a phone number or an address, and a player
 * needs to be able to copy it.
 *
 * This is also section 18's deep link target for an announcement push, which
 * is why it takes an id rather than a preloaded row: the app may be opening
 * cold on a tap from the lock screen.
 *
 * A message that has been soft deleted since the notification went out is a
 * real arrival, not an error — 15.11 says a soft delete "does not recall the
 * push". It gets its own copy rather than a failed load.
 */
import React, { useCallback, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Card, SkeletonCard, Text, WhatsAppButton } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { announcementDirection, directionStyle } from '@/features/announcements/direction';
import { useAnnouncement } from '@/features/announcements/queries';
import { useAnnouncementReadState } from '@/features/announcements/readState';
import { relativeTime } from '@/features/announcements/relativeTime';
import { isOfflineError } from '@/features/sessions/errors';
import { formatSessionDate, nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { AnnouncementsStackParamList, MoreStackParamList } from '@/app/types';

/**
 * One screen, two stacks. 14.11 gives the player his own tab and 15.11 puts
 * the same detail view under the staff More stack; the route carries the same
 * param in both, and nothing on this screen depends on which navigator it is
 * inside. A second copy would be a second thing to keep in step.
 */
type Props =
  | NativeStackScreenProps<AnnouncementsStackParamList, 'AnnouncementDetail'>
  | NativeStackScreenProps<MoreStackParamList, 'AnnouncementDetail'>;

export const AnnouncementDetailScreen: React.FC<Props> = ({ route }) => {
  const { announcementId } = route.params;
  const { t } = useTranslation();
  const theme = useTheme();
  const announcement = useAnnouncement(announcementId);
  const { markRead } = useAnnouncementReadState();

  // Opening it from a notification never passed through the list, so this is
  // where the dot is cleared for a deep link arrival.
  useEffect(() => {
    markRead(announcementId);
  }, [announcementId, markRead]);

  const refetch = useCallback((): void => {
    void announcement.refetch();
  }, [announcement]);

  const containerStyle = {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  } as const;

  if (announcement.isPending) {
    return (
      <View testID="announcement-detail-loading" style={containerStyle}>
        <SkeletonCard />
      </View>
    );
  }

  if (announcement.isError) {
    return (
      <View style={containerStyle}>
        <ErrorState
          message={
            isOfflineError(announcement.error)
              ? t('schedule.offlineBanner')
              : t('announcements.loadError')
          }
          onRetry={refetch}
          isRetrying={announcement.isFetching}
          testID="announcement-detail-error"
        />
      </View>
    );
  }

  if (announcement.data === null) {
    return (
      <View style={containerStyle}>
        <EmptyState message={t('announcements.notFound')} testID="announcement-detail-missing" />
      </View>
    );
  }

  const row = announcement.data;
  const stamp = relativeTime(row.publishedAt, nowInAmman());
  const timestamp =
    stamp.kind === 'absolute'
      ? formatSessionDate(row.publishedAt, theme.locale)
      : stamp.key === 'announcements.justNow'
        ? t(stamp.key)
        : t(stamp.key, { count: stamp.count });

  return (
    <ScrollView
      testID="announcement-detail"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
    >
      <Card>
        <Text variant="caption" tone="tertiary">
          {timestamp}
        </Text>
        {/* 14.11's per-message direction, and 14.11's selectable text. */}
        <Text
          variant="body"
          selectable
          style={directionStyle(announcementDirection(row.body, row.language), theme.isRTL)}
          testID="announcement-detail-body"
        >
          {row.body}
        </Text>
      </Card>

      {/* Centred under the notice, not pinned to the bottom of the screen the
          way the list's is: there is one card here and the button is already
          in view, so a bar would only take height from the text. */}
      <WhatsAppButton style={styles.contact} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  contact: {
    alignSelf: 'center',
  },
});

export default AnnouncementDetailScreen;
