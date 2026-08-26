/**
 * One announcement in a list. BUILD-SPEC 14.11 and 15.11.
 *
 * "Reverse chronological list of announcement bodies with relative timestamps.
 * Text is displayed in whatever language it was written in, with the correct
 * text direction detected per message rather than following the app language.
 * Unread ones carry a dot."
 *
 * ── The direction override ───────────────────────────────
 * Every other piece of text in this app takes its direction from the app
 * (16.2), because every other piece of text is the deck's and the deck is in
 * the reader's language. The body is not: D69 lets the coach type in whichever
 * language he likes and sends that one message to everybody. So the body — and
 * only the body — is given an explicit direction from its own content, while
 * the timestamp beside it stays in the reader's.
 *
 * The unread dot is a dot *and* an accessibility label, because a dot is
 * colour and position and nothing else to a screen reader.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card, Text } from '@/components/primitives';
import { announcementDirection, directionStyle } from '@/features/announcements/direction';
import { relativeTime } from '@/features/announcements/relativeTime';
import type { Announcement } from '@/features/announcements/types';
import { formatSessionDate } from '@/lib/time';
import { useTheme } from '@/theme';

export interface AnnouncementCardProps {
  announcement: Announcement;
  now: Date;
  isUnread: boolean;
  onPress?: (() => void) | undefined;
  /** 15.11's soft delete, on the staff list only. */
  onDelete?: (() => void) | undefined;
  /** How many lines of the body to show. The detail view shows all of them. */
  numberOfLines?: number | undefined;
  testID?: string | undefined;
}

const UNREAD_DOT_SIZE = 8;

export const AnnouncementCard: React.FC<AnnouncementCardProps> = ({
  announcement,
  now,
  isUnread,
  onPress,
  onDelete,
  numberOfLines,
  testID,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const stamp = relativeTime(announcement.publishedAt, now);
  const timestamp =
    stamp.kind === 'absolute'
      ? formatSessionDate(announcement.publishedAt, theme.locale)
      : stamp.key === 'announcements.justNow'
        ? t(stamp.key)
        : t(stamp.key, { count: stamp.count });

  const direction = announcementDirection(announcement.body, announcement.language);

  return (
    <Card
      {...(onPress === undefined ? {} : { onPress, accessibilityLabel: announcement.body })}
      {...(testID === undefined ? {} : { testID })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        {isUnread ? (
          <View
            accessibilityLabel={t('announcements.unread')}
            testID={testID === undefined ? undefined : `${testID}-unread`}
            style={{
              width: UNREAD_DOT_SIZE,
              height: UNREAD_DOT_SIZE,
              borderRadius: UNREAD_DOT_SIZE / 2,
              backgroundColor: theme.colors.accent,
            }}
          />
        ) : null}

        <Text variant="caption" tone="tertiary" style={{ flex: 1 }}>
          {timestamp}
        </Text>

        {onDelete === undefined ? null : (
          <Text
            variant="caption"
            tone="danger"
            accessibilityRole="button"
            onPress={onDelete}
            testID={testID === undefined ? undefined : `${testID}-delete`}
          >
            {t('announcements.deleteAction')}
          </Text>
        )}
      </View>

      <Text
        variant="body"
        {...(numberOfLines === undefined ? {} : { numberOfLines })}
        style={directionStyle(direction)}
        testID={testID === undefined ? undefined : `${testID}-body`}
      >
        {announcement.body}
      </Text>
    </Card>
  );
};

export default AnnouncementCard;
