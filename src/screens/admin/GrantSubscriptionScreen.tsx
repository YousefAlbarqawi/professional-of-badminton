/**
 * Grant a subscription. BUILD-SPEC 15.9 and 11.2.
 *
 * "Package picker showing visits, price, duration, and per visit rate. Start
 * date defaulting to today. Expiry auto-filled and editable. Visit count
 * override. Note field. A summary line before saving: *40 credits, expires 20
 * November 2026.*"
 *
 * ── The three defaults, and why each is editable ──────────
 * Picking a package fills the expiry (start + the package's months) and the
 * visit count (the package's own). Both are then the coach's to change, per
 * 11.2 steps 3 and 4 — he sells a 40 visit package to somebody who is going
 * abroad for a fortnight and gives him an extra month, and the app does not
 * argue. `addMonths` computes the same date `grant_subscription` would have
 * defaulted to, so leaving the field alone changes nothing.
 *
 * ── What this screen deliberately does not ask ────────────
 * Whether he paid. D50: "Money for a subscription is arranged outside the app,
 * in instalments or in full. The app does not track subscription payment." The
 * note is where "paid 80, 45 remaining" goes, and a balance entry (10.3) is
 * where it goes if the coach wants it to be a number.
 *
 * D51 lets a player hold several at once, including duplicates of the same
 * package, so nothing here checks for an existing one.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, Card, FormDateField, FormField, SkeletonCard, Text } from '@/components/primitives';
import { ErrorState } from '@/components/states';
import { addMonths } from '@/features/subscriptions/creditLedger';
import { subscriptionErrorMessageKey } from '@/features/subscriptions/errors';
import { useGrantSubscription } from '@/features/subscriptions/mutations';
import { usePackages } from '@/features/subscriptions/queries';
import {
  grantSubscriptionSchema,
  type GrantSubscriptionForm,
} from '@/features/subscriptions/schemas';
import type { Package } from '@/features/subscriptions/types';
import { formatMoney } from '@/lib/money';
import { ammanDayKey, ammanDayStart, formatSessionDate, nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { PlayerAdminRoutes } from '@/app/types';

type Props = NativeStackScreenProps<PlayerAdminRoutes, 'GrantSubscription'>;

export const GrantSubscriptionScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const packages = usePackages();

  const retry = useCallback((): void => {
    void packages.refetch();
  }, [packages]);

  if (packages.isPending) {
    return (
      <View
        testID="grant-loading"
        style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}
      >
        <SkeletonCard />
      </View>
    );
  }

  if (packages.isError || packages.data === undefined || packages.data.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}>
        <ErrorState
          message={t(subscriptionErrorMessageKey(packages.error))}
          onRetry={retry}
          isRetrying={packages.isFetching}
          testID="grant-error"
        />
      </View>
    );
  }

  // The form is mounted only once the packages are in, so its defaults are
  // right at mount and no effect has to correct them afterwards.
  return (
    <GrantForm
      packages={packages.data}
      playerId={route.params.playerId}
      onGranted={navigation.goBack}
    />
  );
};

interface GrantFormProps {
  packages: Package[];
  playerId: string;
  onGranted: () => void;
}

const GrantForm: React.FC<GrantFormProps> = ({ packages, playerId, onGranted }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const grant = useGrantSubscription();

  const today = ammanDayKey(nowInAmman());
  const first = packages[0];

  const [packageId, setPackageId] = useState<string>(first?.id ?? '');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit, setValue } = useForm<GrantSubscriptionForm>({
    resolver: zodResolver(grantSubscriptionSchema),
    mode: 'onBlur',
    defaultValues: {
      packageId: first?.id ?? '',
      startsOn: today,
      expiresOn: addMonths(today, first?.durationMonths ?? 1),
      visits: String(first?.visitCount ?? 0),
      note: '',
    },
  });

  const startsOn = useWatch({ control, name: 'startsOn' });
  const expiresOn = useWatch({ control, name: 'expiresOn' });
  const visits = useWatch({ control, name: 'visits' });

  const selected = useMemo(
    () => packages.find((candidate) => candidate.id === packageId),
    [packageId, packages],
  );

  /**
   * 11.2 steps 3 and 4. Choosing a package refills the two fields that follow
   * from it; the coach may then edit either. The start date is read from the
   * form rather than from `today`, so picking a package after moving the start
   * date keeps the date he chose.
   */
  const choosePackage = useCallback(
    (chosen: Package): void => {
      setPackageId(chosen.id);
      setValue('packageId', chosen.id, { shouldValidate: true });
      setValue('visits', String(chosen.visitCount));
      setValue('expiresOn', addMonths(startsOn.trim(), chosen.durationMonths), {
        shouldValidate: true,
      });
    },
    [setPackageId, setValue, startsOn],
  );

  const onSubmit = useCallback(
    (values: GrantSubscriptionForm): void => {
      setSubmitError(null);
      grant.mutate(
        {
          playerId,
          packageId: values.packageId,
          startsOn: values.startsOn.trim(),
          expiresOn: values.expiresOn.trim(),
          grantedVisits: Number(values.visits),
          note: values.note.trim() === '' ? null : values.note.trim(),
        },
        {
          onSuccess: onGranted,
          onError: (error) => setSubmitError(t(subscriptionErrorMessageKey(error))),
        },
      );
    },
    [grant, onGranted, playerId, setSubmitError, t],
  );

  const summaryVisits = /^\d+$/.test(visits.trim()) ? Number(visits.trim()) : 0;
  const isSummaryReady = summaryVisits > 0 && /^\d{4}-\d{2}-\d{2}$/.test(expiresOn.trim());

  return (
    <ScrollView
      testID="grant-subscription"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
    >
      {/* 15.9's picker: "visits, price, duration, and per visit rate". Five
          rows rather than a segmented control, because each carries four
          figures the coach compares against each other. D48. */}
      <Card>
        <Text variant="heading">{t('admin.subs.grantPackage')}</Text>
        <View style={{ gap: theme.spacing.sm }}>
          {packages.map((option) => (
            <Card
              key={option.id}
              isElevated
              testID={`package-${option.id}`}
              onPress={() => choosePackage(option)}
              accessibilityLabel={theme.locale === 'ar' ? option.nameAr : option.nameEn}
              style={
                option.id === packageId
                  ? { borderColor: theme.colors.accent, borderWidth: 2 }
                  : undefined
              }
            >
              <Text variant="body" weight="600">
                {theme.locale === 'ar' ? option.nameAr : option.nameEn}
              </Text>
              <Text variant="small" tone="secondary">
                {t('admin.subs.grantPackageLine', {
                  visits: option.visitCount,
                  price: formatMoney(option.priceFils, theme.locale),
                  months: option.durationMonths,
                })}
              </Text>
              {/* 11.1 and 12.2 rule 1: this is what a credit from this package
                  will be worth, and it is snapshotted onto the subscription. */}
              <Text variant="caption" tone="tertiary">
                {t('admin.subs.grantPerVisit', {
                  amount: formatMoney(option.perVisitFils, theme.locale),
                })}
              </Text>
            </Card>
          ))}
        </View>
      </Card>

      <Card>
        {/* A35's amendment, phase 10 — see OPEN-ITEMS.md. */}
        <FormDateField
          control={control}
          name="startsOn"
          label={t('admin.subs.grantStartsOn')}
          doneLabel={t('common.done')}
          testID="grant-starts-on"
        />
        <FormDateField
          control={control}
          name="expiresOn"
          label={t('admin.subs.grantExpiresOn')}
          doneLabel={t('common.done')}
          testID="grant-expires-on"
        />
        <FormField
          control={control}
          name="visits"
          label={t('admin.subs.grantVisits')}
          keyboardType="number-pad"
          testID="grant-visits"
        />
        <FormField
          control={control}
          name="note"
          label={t('admin.subs.grantNote')}
          hint={t('admin.subs.grantNoteHint')}
          maxLength={200}
          testID="grant-note"
        />

        {/* D50, said out loud so the coach is not left wondering where the
            money he took goes. */}
        <Text variant="caption" tone="tertiary" testID="grant-not-paid-here">
          {t('admin.subs.notPaidHere')}
        </Text>
      </Card>

      {/* 15.9: "A summary line before saving." */}
      {isSummaryReady ? (
        <Text variant="body" tone="secondary" testID="grant-summary">
          {t('admin.subs.grantSummary', {
            count: summaryVisits,
            date: formatSessionDate(ammanDayStart(expiresOn.trim()), theme.locale),
          })}
        </Text>
      ) : null}

      {submitError === null ? null : (
        <Text variant="small" tone="danger" testID="grant-submit-error">
          {submitError}
        </Text>
      )}

      <Button
        label={t('admin.subs.grantSubmit')}
        onPress={handleSubmit(onSubmit)}
        isLoading={grant.isPending}
        isDisabled={selected === undefined}
        isFullWidth
        testID="grant-submit"
      />
    </ScrollView>
  );
};

export default GrantSubscriptionScreen;
