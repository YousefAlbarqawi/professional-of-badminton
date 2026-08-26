/**
 * Adjust credits. BUILD-SPEC 15.10 and 11.3.
 *
 * "Subscription picker, signed amount, required note, and a preview: *Balance
 * goes from 40 to 27.* Save writes one `manual_adjustment` transaction."
 *
 * ── This screen is the migration ──────────────────────────
 * 11.3 is not hypothetical: "There are a handful of people mid-subscription
 * today." The documented flow is to grant the full 40 visit package on 15.9,
 * then come here and adjust by −13 with the note "used before the app". The
 * balance reads 27 and the history says why, forever.
 *
 * 11.3 is equally clear about what must not be built for it: "Do not make him
 * book and cancel phantom sessions. Do not build a special import screen. The
 * adjust action is enough." There is no import anywhere in this phase, and
 * this screen is a form over one RPC.
 *
 * ── The note is required ──────────────────────────────────
 * D56 makes it a rule about the ledger rather than about a form: every
 * movement carries a reason. `manual_adjustment` is the one reason that does
 * not explain itself, so the note is what makes the row readable — and the
 * server refuses a blank one with `note_required` whoever sends it.
 *
 * ── The preview is the ledger, before it is written ───────
 * `from` is `remainingCredits`, the sum of the transactions already there;
 * `to` is that sum plus the delta. Nothing is stored, nothing is cached, and
 * the number the coach reads here is arithmetic he can check against the
 * history on the same screen.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { CreditHistoryRow } from '@/components/domain';
import { Button, Card, FormField, SkeletonCard, Text } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { remainingCredits, splitSubscriptions } from '@/features/subscriptions/creditLedger';
import { subscriptionErrorMessageKey } from '@/features/subscriptions/errors';
import { useAdjustCredits } from '@/features/subscriptions/mutations';
import { usePlayerSubscriptions } from '@/features/subscriptions/queries';
import { adjustCreditsSchema, type AdjustCreditsForm } from '@/features/subscriptions/schemas';
import type { Subscription } from '@/features/subscriptions/types';
import { ammanDayKey, ammanDayStart, formatSessionDate, nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { PlayerAdminRoutes } from '@/app/types';

type Props = NativeStackScreenProps<PlayerAdminRoutes, 'AdjustCredits'>;

export const AdjustCreditsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { playerId, subscriptionId } = route.params;
  const subscriptions = usePlayerSubscriptions(playerId);

  const today = ammanDayKey(nowInAmman());

  const retry = useCallback((): void => {
    void subscriptions.refetch();
  }, [subscriptions]);

  // 11.5: a voided subscription's ledger is closed and `adjust_credits`
  // refuses it. Offering it here would only produce a failure.
  const adjustable = useMemo(
    () => splitSubscriptions(subscriptions.data ?? [], today).active,
    [subscriptions.data, today],
  );

  if (subscriptions.isPending) {
    return (
      <View
        testID="adjust-loading"
        style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}
      >
        <SkeletonCard />
      </View>
    );
  }

  if (subscriptions.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}>
        <ErrorState
          message={t(subscriptionErrorMessageKey(subscriptions.error))}
          onRetry={retry}
          isRetrying={subscriptions.isFetching}
          testID="adjust-error"
        />
      </View>
    );
  }

  if (adjustable.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}>
        <EmptyState
          message={t('admin.subs.adjustNoSubscription')}
          actionLabel={t('admin.subs.grant')}
          onAction={() => navigation.navigate('GrantSubscription', { playerId })}
          showWhatsApp={false}
          testID="adjust-empty"
        />
      </View>
    );
  }

  const preselected =
    adjustable.find((candidate) => candidate.id === subscriptionId) ?? adjustable[0];

  return (
    <AdjustForm
      subscriptions={adjustable}
      initialSubscriptionId={preselected?.id ?? ''}
      onAdjusted={navigation.goBack}
    />
  );
};

interface AdjustFormProps {
  subscriptions: Subscription[];
  initialSubscriptionId: string;
  onAdjusted: () => void;
}

const AdjustForm: React.FC<AdjustFormProps> = ({
  subscriptions,
  initialSubscriptionId,
  onAdjusted,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const adjust = useAdjustCredits();

  const [subscriptionId, setSubscriptionId] = useState(initialSubscriptionId);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit, setValue } = useForm<AdjustCreditsForm>({
    resolver: zodResolver(adjustCreditsSchema),
    mode: 'onBlur',
    defaultValues: { subscriptionId: initialSubscriptionId, delta: '', note: '' },
  });

  const delta = useWatch({ control, name: 'delta' });

  const selected = useMemo(
    () => subscriptions.find((candidate) => candidate.id === subscriptionId),
    [subscriptionId, subscriptions],
  );

  const from = selected === undefined ? 0 : remainingCredits(selected);
  const parsedDelta = /^-?\d+$/.test(delta.trim()) ? Number(delta.trim()) : null;
  const to = parsedDelta === null ? null : from + parsedDelta;

  const chooseSubscription = useCallback(
    (id: string): void => {
      setSubscriptionId(id);
      setValue('subscriptionId', id, { shouldValidate: true });
    },
    [setValue],
  );

  const onSubmit = useCallback(
    (values: AdjustCreditsForm): void => {
      setSubmitError(null);
      adjust.mutate(
        {
          subscriptionId: values.subscriptionId,
          delta: Number(values.delta.trim()),
          note: values.note.trim(),
        },
        {
          onSuccess: onAdjusted,
          onError: (error) => setSubmitError(t(subscriptionErrorMessageKey(error))),
        },
      );
    },
    [adjust, onAdjusted, t],
  );

  // The server refuses a negative balance with `insufficient_credits`. Saying
  // so before he presses save is kinder than saying so after.
  const wouldGoNegative = to !== null && to < 0;

  return (
    <ScrollView
      testID="adjust-credits"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
    >
      {/* D51 lets a player hold several at once, so which one is being
          adjusted is a choice and not an assumption. */}
      <Card>
        <Text variant="heading">{t('admin.subs.adjustSubscription')}</Text>
        <View style={{ gap: theme.spacing.sm }}>
          {subscriptions.map((subscription) => (
            <Card
              key={subscription.id}
              isElevated
              testID={`adjust-pick-${subscription.id}`}
              onPress={() => chooseSubscription(subscription.id)}
              style={
                subscription.id === subscriptionId
                  ? { borderColor: theme.colors.accent, borderWidth: 2 }
                  : undefined
              }
            >
              <Text variant="body" weight="600">
                {theme.locale === 'ar' ? subscription.packageNameAr : subscription.packageNameEn}
              </Text>
              <Text variant="small" tone="secondary">
                {t('subscriptions.ofGranted', { granted: subscription.grantedVisits })}
                {' · '}
                {String(remainingCredits(subscription))}
              </Text>
              <Text variant="caption" tone="tertiary">
                {t('subscriptions.expiresOn', {
                  date: formatSessionDate(ammanDayStart(subscription.expiresOn), theme.locale),
                })}
              </Text>
            </Card>
          ))}
        </View>
      </Card>

      <Card>
        <FormField
          control={control}
          name="delta"
          label={t('admin.subs.adjustAmount')}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          isLTR
          testID="adjust-delta"
        />
        {/* 11.3 and D56. Not optional, here or on the server. */}
        <FormField
          control={control}
          name="note"
          label={t('admin.subs.adjustNote')}
          hint={t('admin.subs.adjustNoteHint')}
          maxLength={200}
          testID="adjust-note"
        />

        {/* 15.10's preview, verbatim: "Balance goes from 40 to 27." */}
        {to === null ? null : (
          <Text
            variant="body"
            tone={wouldGoNegative ? 'danger' : 'secondary'}
            testID="adjust-preview"
          >
            {wouldGoNegative
              ? t('admin.error.insufficientCredits')
              : t('admin.subs.adjustPreview', { from: String(from), to: String(to) })}
          </Text>
        )}
      </Card>

      {/* The ledger the adjustment is about to join, so the coach can see what
          he is correcting before he corrects it. D56. */}
      {selected === undefined ? null : (
        <Card testID="adjust-history">
          <Text variant="heading">{t('subscriptions.history')}</Text>
          {selected.transactions.length === 0 ? (
            <Text variant="small" tone="tertiary">
              {t('subscriptions.historyEmpty')}
            </Text>
          ) : (
            [...selected.transactions]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((txn) => (
                <CreditHistoryRow
                  key={txn.id}
                  testID={`adjust-history-${txn.id}`}
                  delta={txn.delta}
                  reason={txn.reason}
                  note={txn.note}
                  createdAt={txn.createdAt}
                />
              ))
          )}
        </Card>
      )}

      {submitError === null ? null : (
        <Text variant="small" tone="danger" testID="adjust-submit-error">
          {submitError}
        </Text>
      )}

      <Button
        label={t('admin.subs.adjustSubmit')}
        onPress={handleSubmit(onSubmit)}
        isLoading={adjust.isPending}
        isDisabled={wouldGoNegative}
        isFullWidth
        testID="adjust-submit"
      />
    </ScrollView>
  );
};

export default AdjustCreditsScreen;
