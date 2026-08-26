/**
 * The announcement composer. BUILD-SPEC 15.11 and D69.
 *
 * "Composer: a language selector defaulting to Arabic, a body field with a
 * 2000 character counter, and a preview. Publishing sends a push to every
 * registered device immediately. A confirmation dialog states how many devices
 * will receive it."
 *
 * ── The language selector is not a dual language form ────
 * D69 is explicit: "one message to everyone, in whichever language the author
 * types. Not a dual language form." So the selector says what he is writing,
 * not which of two bodies this is. It defaults to Arabic, matching 16.1's
 * default for the app itself and the majority of players.
 *
 * What it actually decides is small and worth stating: the field's own text
 * direction while he types, and the fallback direction on the reader's screen
 * for a message with no strong characters in it (`direction.ts`). It does not
 * translate anything and it does not filter who is told.
 *
 * ── The preview is the player's card ─────────────────────
 * Rather than a styled block that approximates one, the preview is
 * `AnnouncementCard` — the same component 14.11 renders — so what the coach
 * checks is the thing that ships, including the per-message direction he may
 * not have expected.
 *
 * ── The confirmation counts devices, not players ─────────
 * 15.11 says devices, and devices is what `device_tokens` holds: a player with
 * a phone and a tablet is two, and a player who has never granted permission
 * (section 18) is none. The number is fetched when the dialog opens rather
 * than kept fresh in the background, because it is the one fact he is being
 * asked to weigh.
 *
 * ── 9.4's prefill ────────────────────────────────────────
 * `route.params.draftBody` arrives from the cancellation prompt (A6). The
 * coach has just cancelled a session, no push was sent (D31), and this is the
 * one deliberate tap that tells anybody.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AnnouncementCard } from '@/components/domain';
import { Button, Card, Dialog, FormField, SegmentedControl, Text } from '@/components/primitives';
import { announcementErrorMessageKey } from '@/features/announcements/errors';
import { usePublishAnnouncement } from '@/features/announcements/mutations';
import { usePushDeviceCount } from '@/features/announcements/queries';
import {
  announcementLength,
  announcementSchema,
  isAnnouncementOverLength,
  ANNOUNCEMENT_MAX_LENGTH,
  type AnnouncementFormValues,
} from '@/features/announcements/schemas';
import type { Locale } from '@/lib/money';
import { nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { MoreStackParamList } from '@/app/types';

type Props = NativeStackScreenProps<MoreStackParamList, 'AnnouncementCompose'>;

/** D69 and 15.11: Arabic is the default. */
const DEFAULT_LANGUAGE: Locale = 'ar';

export const AnnouncementComposeScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const publish = usePublishAnnouncement();

  const [language, setLanguage] = useState<Locale>(DEFAULT_LANGUAGE);
  const [isConfirming, setIsConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementSchema),
    mode: 'onBlur',
    defaultValues: { body: route.params?.draftBody ?? '' },
  });

  const body = useWatch({ control, name: 'body' }) ?? '';
  const length = announcementLength(body);
  const isOverLength = isAnnouncementOverLength(body);

  // Only asked for once the dialog is open. 15.11's number is a fact about
  // this moment, and the coach is about to act on it.
  const deviceCount = usePushDeviceCount(isConfirming);

  const languageOptions = useMemo(
    () => [
      { value: 'ar' as const, label: t('announcements.languageArabic') },
      { value: 'en' as const, label: t('announcements.languageEnglish') },
    ],
    [t],
  );

  const preview = useMemo(
    () => ({
      id: 'preview',
      body,
      language,
      publishedAt: nowInAmman(),
      pushSentAt: null,
    }),
    [body, language],
  );

  const openConfirmation = useCallback((): void => {
    setSubmitError(null);
    setIsConfirming(true);
  }, []);

  const send = useCallback(
    (values: AnnouncementFormValues): void => {
      publish.mutate(
        { body: values.body, language },
        {
          onSuccess: () => {
            setIsConfirming(false);
            navigation.goBack();
          },
          onError: (error) => {
            setIsConfirming(false);
            setSubmitError(t(announcementErrorMessageKey(error)));
          },
        },
      );
    },
    [language, navigation, publish, t],
  );

  const confirmMessage =
    deviceCount.data === undefined
      ? t('announcements.confirmCounting')
      : t('announcements.confirmBody', { count: deviceCount.data });

  return (
    <ScrollView
      testID="announcement-compose"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        {/* D69: which language he is typing, not which of two bodies. */}
        <SegmentedControl
          label={t('announcements.language')}
          options={languageOptions}
          value={language}
          onChange={setLanguage}
          testID="announcement-language"
        />
      </Card>

      <Card>
        <FormField
          control={control}
          name="body"
          label={t('announcements.body')}
          placeholder={t('announcements.bodyPlaceholder')}
          multiline
          numberOfLines={8}
          // The field follows the language he chose, so he is typing in the
          // direction he is writing rather than the direction the app is in.
          isLTR={language === 'en'}
          // Not `maxLength`: a hard stop swallows a paste with no explanation.
          // The counter turns red and the button refuses instead.
          testID="announcement-body"
        />

        <Text
          variant="caption"
          tone={isOverLength ? 'danger' : 'tertiary'}
          testID="announcement-counter"
        >
          {t('announcements.counter', { count: length, max: ANNOUNCEMENT_MAX_LENGTH })}
        </Text>
      </Card>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">{t('announcements.preview')}</Text>
        {length === 0 ? (
          <Card>
            <Text variant="body" tone="tertiary" testID="announcement-preview-empty">
              {t('announcements.previewEmpty')}
            </Text>
          </Card>
        ) : (
          <AnnouncementCard
            announcement={preview}
            now={preview.publishedAt}
            isUnread={false}
            testID="announcement-preview"
          />
        )}
      </View>

      {submitError === null ? null : (
        <Text variant="small" tone="danger" testID="announcement-error">
          {submitError}
        </Text>
      )}

      <Button
        label={t('announcements.publish')}
        onPress={openConfirmation}
        isDisabled={length === 0 || isOverLength}
        isLoading={publish.isPending}
        isFullWidth
        testID="announcement-publish"
      />

      {/* 15.11: "A confirmation dialog states how many devices will receive
          it." It is also the last chance: a push cannot be recalled, which the
          copy says rather than implying. */}
      <Dialog
        isVisible={isConfirming}
        title={t('announcements.confirmTitle')}
        message={confirmMessage}
        confirmLabel={t('announcements.confirmAction')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleSubmit(send)}
        onCancel={() => setIsConfirming(false)}
        isConfirming={publish.isPending}
        testID="announcement-confirm"
      />
    </ScrollView>
  );
};

export default AnnouncementComposeScreen;
