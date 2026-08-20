/**
 * The Phase 0 placeholder. It exists to prove the foundation works end to end:
 * theme tokens render, the primitives compose, money and time format per
 * locale, and the language switch flips both the strings and the layout
 * direction.
 *
 * Phase 3 replaces this with the real schedule list.
 */
import React, { useCallback, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Card, Skeleton, SkeletonCard, Text } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { useChangeLanguage } from '@/i18n/useChangeLanguage';
import { fils, formatMoney } from '@/lib/money';
import { formatSessionDate, formatSessionTimeRange, nowInAmman, parseInstant } from '@/lib/time';
import { useTheme } from '@/theme';

/** A Khalda Saturday session: 19:00 to 20:30 Amman. D5 and section 3.1. */
const SAMPLE_START = '2026-08-22T16:00:00.000Z';
const SAMPLE_END = '2026-08-22T17:30:00.000Z';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="caption" tone="tertiary">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
};

export const PlaceholderScreen: React.FC = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { changeLanguage, current } = useChangeLanguage();

  const sample = useMemo(() => {
    const start = parseInstant(SAMPLE_START);
    const end = parseInstant(SAMPLE_END);
    return {
      date: formatSessionDate(start, current),
      range: formatSessionTimeRange(start, end, current),
      standardPrice: formatMoney(fils(6), current),
      extendedPrice: formatMoney(fils(8), current),
      today: formatSessionDate(nowInAmman(), current),
    };
  }, [current]);

  const handleSwitchLanguage = useCallback((): void => {
    changeLanguage(current === 'ar' ? 'en' : 'ar');
  }, [changeLanguage, current]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.md, gap: theme.spacing.lg }}
    >
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="display">{t('auth.welcomeTitle')}</Text>
        <Text variant="small" tone="tertiary">
          {sample.today}
        </Text>
      </View>

      <Card>
        <Text variant="title">{t('placeholder.title')}</Text>
        <Text variant="body" tone="secondary">
          {t('placeholder.body')}
        </Text>
        <Button
          label={current === 'ar' ? t('language.english') : t('language.arabic')}
          onPress={handleSwitchLanguage}
          variant="primary"
          testID="language-switch"
        />
      </Card>

      <Section title={t('schedule.title')}>
        <Card>
          <Text variant="heading">{t('placeholder.sampleSession', { date: sample.date })}</Text>
          <Text variant="body" tone="secondary">
            {sample.range}
          </Text>
          <Text variant="small" tone="secondary">
            {t('placeholder.samplePrice')} · {sample.standardPrice} · {t('session.standard')}
          </Text>
          <Text variant="small" tone="secondary">
            {t('placeholder.sampleExtended')} · {sample.extendedPrice} · {t('session.extended')}
          </Text>
          <Text variant="small" tone="accent">
            {t('schedule.bookedCount', { count: 8, capacity: 16 })} ·{' '}
            {t('schedule.spotsLeft', { count: 8 })}
          </Text>
        </Card>
      </Section>

      <Section title={t('common.loading')}>
        <SkeletonCard />
        <Skeleton width="70%" height={14} />
      </Section>

      <Section title={t('states.emptyTitle')}>
        <Card>
          <EmptyState message={t('placeholder.emptyExample')} showWhatsApp={false} />
        </Card>
      </Section>

      <Section title={t('states.errorTitle')}>
        <Card>
          <ErrorState
            message={t('placeholder.errorExample')}
            onRetry={() => undefined}
            showWhatsApp={false}
          />
        </Card>
      </Section>

      <Section title={t('common.confirm')}>
        <View style={{ gap: theme.spacing.sm, alignItems: 'flex-start' }}>
          <Button label={t('session.reserve')} onPress={() => undefined} variant="primary" />
          <Button label={t('session.joinWaitlist')} onPress={() => undefined} variant="secondary" />
          <Button label={t('common.whatsapp')} onPress={() => undefined} variant="ghost" />
          <Button
            label={t('session.cancelReservation')}
            onPress={() => undefined}
            variant="destructive"
          />
          <Button label={t('common.loading')} onPress={() => undefined} isLoading />
          <Button label={t('schedule.closed')} onPress={() => undefined} isDisabled />
        </View>
      </Section>
    </ScrollView>
  );
};

export default PlaceholderScreen;
