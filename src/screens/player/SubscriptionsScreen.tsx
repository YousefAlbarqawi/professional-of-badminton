/**
 * The player's subscriptions. BUILD-SPEC 14.13, 11.6.
 *
 * "For each active subscription: package name, remaining credits as a large
 * number, granted total, expiry date, and a warning chip within 7 days of
 * expiry. Below, a History list of every credit transaction with reason and
 * date, so a player can see exactly where his credits went. Expired
 * subscriptions appear in a collapsed section."
 *
 * ── Where every number on this screen comes from ──────────
 * The ledger, and only the ledger. `remainingCredits` sums the transactions
 * that are rendered underneath it, so the big number and the history can never
 * disagree: they are the same rows added up and listed out. 6.2 and D56 forbid
 * a counter column, and this screen is what that rule is *for* — 11.3's
 * migration flow ends with "the history explains itself forever", and this is
 * where somebody reads it.
 *
 * ── What is not here ──────────────────────────────────────
 * A purchase button, anywhere, in any state. D49, 14.13 and section 4 item 8.
 * The empty state points at WhatsApp instead, which is where a subscription is
 * actually arranged (D50). His balance is not here either (A4), nor his tier
 * (D19) — this screen knows about credits and nothing else.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CreditHistoryRow, CreditSummaryCard, SubscriptionCard } from '@/components/domain';
import { Button, Card, SkeletonCard, Text, WhatsAppButton } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import {
  isExpiringSoon,
  ledgerHistory,
  remainingCredits,
  splitSubscriptions,
} from '@/features/subscriptions/creditLedger';
import { useMySubscriptions } from '@/features/subscriptions/queries';
import type { Subscription } from '@/features/subscriptions/types';
import { ammanDayKey, nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';

/** The package name in the reader's own language. */
function packageName(subscription: Subscription, locale: 'en' | 'ar'): string {
  return locale === 'ar' ? subscription.packageNameAr : subscription.packageNameEn;
}

export const SubscriptionsScreen: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const subscriptions = useMySubscriptions();
  const [isShowingExpired, setIsShowingExpired] = useState(false);

  // A31: Amman's today, not the device's. A credit that expires today is
  // spendable all of today, and the server agrees with that to the day.
  const today = ammanDayKey(nowInAmman());

  const split = useMemo(
    () => splitSubscriptions(subscriptions.data ?? [], today),
    [subscriptions.data, today],
  );

  const history = useMemo(() => ledgerHistory(subscriptions.data ?? []), [subscriptions.data]);

  const nameById = useMemo(() => {
    const index = new Map<string, string>();
    for (const subscription of subscriptions.data ?? []) {
      index.set(subscription.id, packageName(subscription, theme.locale));
    }
    return index;
  }, [subscriptions.data, theme.locale]);

  const refetch = useCallback((): void => {
    void subscriptions.refetch();
  }, [subscriptions]);

  const toggleExpired = useCallback((): void => setIsShowingExpired((showing) => !showing), []);

  const nearest = split.active[0];

  return (
    <ScrollView
      testID="subscriptions-screen"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
      refreshControl={
        <RefreshControl
          refreshing={subscriptions.isFetching}
          onRefresh={refetch}
          tintColor={theme.colors.textSecondary}
        />
      }
    >
      {subscriptions.isPending ? (
        <View style={{ gap: theme.spacing.md }} testID="subscriptions-loading">
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : subscriptions.isError ? (
        <ErrorState
          message={t('subscriptions.loadError')}
          onRetry={refetch}
          isRetrying={subscriptions.isFetching}
          testID="subscriptions-error"
        />
      ) : (
        <>
          {/* 11.6's total, and the same card 14.12 puts on the profile. */}
          <CreditSummaryCard
            total={split.totalRemaining}
            nextExpiry={nearest?.expiresOn ?? null}
            isExpiringSoon={nearest !== undefined && isExpiringSoon(nearest, today)}
            testID="subscriptions-summary"
          />

          {/* 14.13's empty state names WhatsApp in its copy, and EmptyState
              carries the button itself (D72). */}
          {split.active.length === 0 && split.expired.length === 0 ? (
            <EmptyState message={t('subscriptions.empty')} testID="subscriptions-empty" />
          ) : null}

          {split.active.map((subscription) => (
            <SubscriptionCard
              key={subscription.id}
              testID={`subscription-${subscription.id}`}
              packageName={packageName(subscription, theme.locale)}
              remaining={remainingCredits(subscription)}
              grantedVisits={subscription.grantedVisits}
              expiresOn={subscription.expiresOn}
              isExpiringSoon={isExpiringSoon(subscription, today)}
            />
          ))}

          {/* 14.13: "Expired subscriptions appear in a collapsed section." */}
          {split.expired.length === 0 ? null : (
            <>
              <Button
                label={
                  isShowingExpired
                    ? t('subscriptions.hideExpired')
                    : t('subscriptions.showExpired', { count: split.expired.length })
                }
                onPress={toggleExpired}
                variant="ghost"
                testID="subscriptions-toggle-expired"
              />
              {isShowingExpired
                ? split.expired.map((subscription) => (
                    <SubscriptionCard
                      key={subscription.id}
                      testID={`subscription-${subscription.id}`}
                      packageName={packageName(subscription, theme.locale)}
                      remaining={remainingCredits(subscription)}
                      grantedVisits={subscription.grantedVisits}
                      expiresOn={subscription.expiresOn}
                      isExpired
                    />
                  ))
                : null}
            </>
          )}

          {/* D56: every movement, with its reason. This is the history 11.3
              promises will explain itself. */}
          <Card testID="subscriptions-history">
            <Text variant="heading">{t('subscriptions.history')}</Text>
            {history.length === 0 ? (
              <Text variant="small" tone="tertiary" testID="history-empty">
                {t('subscriptions.historyEmpty')}
              </Text>
            ) : (
              history.map((txn) => (
                <CreditHistoryRow
                  key={txn.id}
                  testID={`history-${txn.id}`}
                  delta={txn.delta}
                  reason={txn.reason}
                  note={txn.note}
                  createdAt={txn.createdAt}
                  subscriptionLabel={nameById.get(txn.subscriptionId)}
                />
              ))
            )}
          </Card>

          {/* D49, said plainly rather than by the absence of a button. */}
          <Text variant="caption" tone="tertiary" testID="subscriptions-not-purchasable">
            {t('subscriptions.notPurchasable')}
          </Text>

          {/* D72: reachable from almost every screen, including this one. */}
          {split.active.length === 0 && split.expired.length === 0 ? null : (
            <WhatsAppButton isFullWidth />
          )}
        </>
      )}
    </ScrollView>
  );
};

export default SubscriptionsScreen;
