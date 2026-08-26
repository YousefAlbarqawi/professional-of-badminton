/**
 * The admin's view of one player. BUILD-SPEC 15.8.
 *
 * ── What is here ───────────────────────────────────────────
 * 15.8 lists eight sections, and this screen now renders all eight:
 *
 *   1. Identity            the header the rest hangs off
 *   5. Subscriptions       phase 6: grant, extend, adjust credits
 *   6. Balance             10.3, and phase 5's reason for existing
 *
 *   2. Tier               a picker, one tap and written (also closes 15.2's
 *                          *Change tier* row action, in `ChangeTierSheet`)
 *   3. Visibility level    a segmented control over D14's three levels
 *   4. Custom rate         standard and extended, blank resets to the
 *                          session's list price, zero is a real rate (D41)
 *   8. Role                coach only, promotes or demotes between player
 *                          and coach (D16)
 *
 *   7. Recent sessions     phase 10: "the last 20 bookings with payment
 *                          outcomes." Closed in OPEN-ITEMS.md, which records
 *                          why it waited — a query and a list, a different
 *                          shape of work from the other four's single-column
 *                          writes. `fetchPlayerRecentSessions` reads
 *                          `bookings` directly, the same as section 6 reads
 *                          `balance_entries`: `bookings_staff_all` (migration
 *                          0012) is the boundary and there is nothing here
 *                          for a function to enforce. A cancelled booking is
 *                          excluded, matching the review screen's own filter
 *                          — 9.3 never creates money from one, so it is not
 *                          a payment outcome to show.
 *
 * None of sections 2, 3, 4 or 8 goes through an RPC. `profiles_update_staff`
 * already grants any staff member `UPDATE` on this row (migration 0012), and
 * `trg_guard_profile` (0009) is what actually decides who may touch these
 * five columns and who may promote to coach — RLS and its trigger are the
 * boundary, not a function, per CLAUDE.md. Every write also fires
 * `trg_audit_profiles` (0011), so each of these four sections already has an
 * audit trail even though nothing here reads it back — that reader is what
 * "and its change history" in OPEN-ITEMS.md's tier item still means.
 *
 * ── Section 5, and the one rule underneath it ─────────────
 * Every credit figure on this screen is `remainingCredits`, the sum of the
 * ledger rendered beside it. 6.2 and D56: there is no counter column, and this
 * is the screen that has to make that visibly true — 11.3's migration ends
 * with the coach reading 27 and being able to see the −13 that produced it.
 *
 * *Extend* is drawn for the coach alone, per D55; see ExtendSubscriptionSheet
 * for why D16's admin powers do not reach it.
 *
 * The balance is built now because phase 5 is what *creates* balance entries:
 * `record_payment` writes them from the review screen, and a debt the coach
 * can never see or settle is half a feature. He reaches this screen by tapping
 * a player on the money tab, which is where he is standing when the debt is
 * created.
 *
 * ── What a balance is not ─────────────────────────────────
 * D40: "Balances never block a booking. They are a record, not a gate." There
 * is nothing on this screen that stops anything. A4 keeps it staff-only: the
 * player is never shown what he owes, which is why `balance_entries` has no
 * player SELECT policy at all rather than a hidden screen.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  CreditHistoryRow,
  PaymentMethodChip,
  SubscriptionCard,
  TierBadge,
  TierPickerRow,
} from '@/components/domain';
import {
  Button,
  Card,
  Chip,
  Dialog,
  NumericInput,
  SegmentedControl,
  SkeletonCard,
  Text,
  isolateLTR,
} from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { useMyProfile } from '@/features/players/queries';
import { paymentErrorMessageKey } from '@/features/payments/errors';
import {
  useDeleteBalanceEntry,
  useSetPlayerRate,
  useSetPlayerRole,
  useSetPlayerTier,
  useSetPlayerVisibility,
} from '@/features/payments/mutations';
import {
  usePlayerBalance,
  usePlayerIdentity,
  usePlayerRecentSessions,
} from '@/features/payments/queries';
import { statusLabelKey, statusTone } from '@/features/payments/reviewState';
import type { BalanceEntry, PlayerIdentity, PlayerRecentSession } from '@/features/payments/types';
import {
  isExpiringSoon,
  ledgerHistory,
  remainingCredits,
  splitSubscriptions,
} from '@/features/subscriptions/creditLedger';
import { subscriptionErrorMessageKey } from '@/features/subscriptions/errors';
import { usePlayerSubscriptions } from '@/features/subscriptions/queries';
import type { Subscription } from '@/features/subscriptions/types';
import { fils, formatMoney, toJD, type Fils } from '@/lib/money';
import type { Tier } from '@/lib/tiers';
import { ammanDayKey, formatSessionDate, nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { PlayerAdminRoutes } from '@/app/types';

import { BalanceEntrySheet } from './BalanceEntrySheet';
import { ExtendSubscriptionSheet } from './ExtendSubscriptionSheet';

type Props = NativeStackScreenProps<PlayerAdminRoutes, 'PlayerProfile'>;

export const PlayerProfileScreen: React.FC<Props> = ({ navigation, route }) => {
  const { playerId } = route.params;
  const { t } = useTranslation();
  const theme = useTheme();

  const identity = usePlayerIdentity(playerId);
  const balance = usePlayerBalance(playerId);
  const recentSessions = usePlayerRecentSessions(playerId);
  const subscriptions = usePlayerSubscriptions(playerId);
  const deleteEntry = useDeleteBalanceEntry();
  const setTier = useSetPlayerTier();
  const setVisibility = useSetPlayerVisibility();
  const setRole = useSetPlayerRole();
  // D55/D16: whether *Extend* and section 8's role toggle are drawn at all.
  // The server refuses an admin regardless; this keeps him from being offered
  // either.
  const me = useMyProfile();
  const isCoach = me.data?.role === 'coach';

  const [isAdding, setIsAdding] = useState(false);
  const [deleting, setDeleting] = useState<BalanceEntry | null>(null);
  const [extending, setExtending] = useState<Subscription | null>(null);
  const [isConfirmingRole, setConfirmingRole] = useState(false);

  const openAdd = useCallback((): void => setIsAdding(true), []);
  const closeAdd = useCallback((): void => setIsAdding(false), []);
  const closeDelete = useCallback((): void => setDeleting(null), []);
  const openRoleConfirm = useCallback((): void => setConfirmingRole(true), []);
  const closeRoleConfirm = useCallback((): void => setConfirmingRole(false), []);

  const chooseTier = useCallback(
    (tier: Tier | null): void => setTier.mutate({ playerId, tier }),
    [playerId, setTier],
  );

  const chooseVisibility = useCallback(
    (visibility: PlayerIdentity['visibility']): void =>
      setVisibility.mutate({ playerId, visibility }),
    [playerId, setVisibility],
  );

  const confirmRoleChange = useCallback((): void => {
    if (identity.data === undefined) return;
    const nextRole = identity.data.role === 'coach' ? 'player' : 'coach';
    setRole.mutate({ playerId, role: nextRole }, { onSuccess: closeRoleConfirm });
  }, [closeRoleConfirm, identity.data, playerId, setRole]);

  const refetch = useCallback((): void => {
    void identity.refetch();
    void balance.refetch();
    void recentSessions.refetch();
    void subscriptions.refetch();
  }, [balance, identity, recentSessions, subscriptions]);

  const closeExtend = useCallback((): void => setExtending(null), []);

  const openGrant = useCallback(
    (): void => navigation.navigate('GrantSubscription', { playerId }),
    [navigation, playerId],
  );

  const openAdjust = useCallback(
    (subscriptionId?: string): void =>
      navigation.navigate('AdjustCredits', {
        playerId,
        ...(subscriptionId === undefined ? {} : { subscriptionId }),
      }),
    [navigation, playerId],
  );

  const confirmDelete = useCallback((): void => {
    if (deleting === null) return;
    deleteEntry.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }, [deleteEntry, deleting]);

  const owed = balance.data?.totalOwedFils ?? (0 as Fils);
  const entries = balance.data?.entries ?? [];

  const today = ammanDayKey(nowInAmman());
  const split = useMemo(
    () => splitSubscriptions(subscriptions.data ?? [], today),
    [subscriptions.data, today],
  );
  const history = useMemo(() => ledgerHistory(subscriptions.data ?? []), [subscriptions.data]);

  const packageName = useCallback(
    (subscription: Subscription): string =>
      theme.locale === 'ar' ? subscription.packageNameAr : subscription.packageNameEn,
    [theme.locale],
  );

  return (
    <ScrollView
      testID="player-profile"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
      refreshControl={
        <RefreshControl
          refreshing={
            identity.isFetching ||
            balance.isFetching ||
            recentSessions.isFetching ||
            subscriptions.isFetching
          }
          onRefresh={refetch}
          tintColor={theme.colors.textSecondary}
        />
      }
    >
      {/* 15.8 section 1. */}
      {identity.isPending ? (
        <SkeletonCard testID="profile-loading" />
      ) : identity.isError || identity.data === undefined ? (
        <ErrorState
          message={t(paymentErrorMessageKey(identity.error))}
          onRetry={refetch}
          isRetrying={identity.isFetching}
          testID="profile-error"
        />
      ) : (
        <Card testID="profile-identity">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <TierBadge tier={identity.data.tier} />
            <Text variant="title" style={{ flex: 1 }}>
              {identity.data.fullName}
            </Text>
          </View>
          {identity.data.phone === null ? null : (
            // 16.2: a phone number is always LTR, whatever the app language is.
            <Text variant="small" tone="secondary">
              {isolateLTR(identity.data.phone)}
            </Text>
          )}
          <Text variant="caption" tone="tertiary">
            {t('admin.profile.joined', {
              date: formatSessionDate(identity.data.joinedAt, theme.locale),
            })}
          </Text>
        </Card>
      )}

      {identity.data === undefined ? null : (
        <>
          {/* 15.8 section 2. Also closes 15.2's *Change tier* row action —
              this is the same write `ChangeTierSheet` makes. */}
          <Card testID="profile-tier">
            <Text variant="heading">{t('admin.profile.tier.title')}</Text>
            <View style={{ paddingTop: theme.spacing.sm }}>
              <TierPickerRow
                value={identity.data.tier}
                onChange={chooseTier}
                isDisabled={setTier.isPending}
                testID="profile-tier-picker"
              />
            </View>
            {setTier.isError ? (
              <Text variant="small" tone="danger" testID="profile-tier-error">
                {t(paymentErrorMessageKey(setTier.error))}
              </Text>
            ) : null}
          </Card>

          {/* 15.8 section 3. D14's three levels, refused to a non-staff
              writer by trg_guard_profile whatever this control does. */}
          <Card testID="profile-visibility">
            <SegmentedControl<PlayerIdentity['visibility']>
              label={t('admin.profile.visibility.title')}
              options={[
                { value: 'level_0', label: t('admin.players.visibility0') },
                { value: 'level_1', label: t('admin.players.visibility1') },
                { value: 'level_2', label: t('admin.players.visibility2') },
              ]}
              value={identity.data.visibility}
              onChange={chooseVisibility}
              isDisabled={setVisibility.isPending}
              testID="profile-visibility-control"
            />
            {setVisibility.isError ? (
              <Text variant="small" tone="danger" testID="profile-visibility-error">
                {t(paymentErrorMessageKey(setVisibility.error))}
              </Text>
            ) : null}
          </Card>

          {/* 15.8 section 4. */}
          <CustomRateSection playerId={playerId} identity={identity.data} />
        </>
      )}

      {/* 15.8 section 5: "Active and expired, with Grant a subscription,
          Extend, and Adjust credits." */}
      <Card testID="profile-subscriptions">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="heading" style={{ flex: 1 }}>
            {t('admin.subs.title')}
          </Text>
          <Text variant="title" tone="accent" testID="profile-credits-total">
            {String(split.totalRemaining)}
          </Text>
        </View>

        {/* D50, so the coach is never left wondering whether the app is
            tracking money it deliberately does not track. */}
        <Text variant="caption" tone="tertiary" style={{ paddingTop: theme.spacing.xs }}>
          {t('admin.subs.notPaidHere')}
        </Text>

        <View style={{ paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <Button
            label={t('admin.subs.grant')}
            onPress={openGrant}
            variant="secondary"
            testID="profile-grant"
          />
          {split.active.length === 0 ? null : (
            <Button
              label={t('admin.subs.adjust')}
              onPress={() => openAdjust()}
              variant="secondary"
              testID="profile-adjust"
            />
          )}
        </View>

        <View style={{ paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>
          {subscriptions.isPending ? (
            <SkeletonCard testID="subscriptions-loading" />
          ) : subscriptions.isError ? (
            <ErrorState
              message={t(subscriptionErrorMessageKey(subscriptions.error))}
              onRetry={refetch}
              isRetrying={subscriptions.isFetching}
              testID="subscriptions-list-error"
            />
          ) : split.active.length === 0 && split.expired.length === 0 ? (
            <EmptyState
              message={t('admin.subs.empty')}
              showWhatsApp={false}
              testID="subscriptions-empty"
            />
          ) : (
            <>
              {split.active.map((subscription) => (
                <SubscriptionCard
                  key={subscription.id}
                  testID={`subscription-${subscription.id}`}
                  packageName={packageName(subscription)}
                  remaining={remainingCredits(subscription)}
                  grantedVisits={subscription.grantedVisits}
                  expiresOn={subscription.expiresOn}
                  isExpiringSoon={isExpiringSoon(subscription, today)}
                  actions={
                    <>
                      {/* D55: only the coach extends, and only before it
                          expires — which is why this sits on an active card. */}
                      {isCoach ? (
                        <Button
                          label={t('admin.subs.extend')}
                          onPress={() => setExtending(subscription)}
                          variant="ghost"
                          testID={`extend-${subscription.id}`}
                        />
                      ) : null}
                      <Button
                        label={t('admin.subs.adjust')}
                        onPress={() => openAdjust(subscription.id)}
                        variant="ghost"
                        testID={`adjust-${subscription.id}`}
                      />
                    </>
                  }
                />
              ))}

              {split.expired.map((subscription) => (
                <SubscriptionCard
                  key={subscription.id}
                  testID={`subscription-${subscription.id}`}
                  packageName={packageName(subscription)}
                  remaining={remainingCredits(subscription)}
                  grantedVisits={subscription.grantedVisits}
                  expiresOn={subscription.expiresOn}
                  isExpired
                />
              ))}

              {/* D56, and 11.3's promise that the history explains itself. The
                  coach reads this back when a player disputes a balance. */}
              <Text variant="heading" style={{ paddingTop: theme.spacing.sm }}>
                {t('subscriptions.history')}
              </Text>
              {history.map((txn) => (
                <CreditHistoryRow
                  key={txn.id}
                  testID={`credit-history-${txn.id}`}
                  delta={txn.delta}
                  reason={txn.reason}
                  note={txn.note}
                  createdAt={txn.createdAt}
                />
              ))}
            </>
          )}
        </View>
      </Card>

      {/* 15.8 section 6, and 10.3. */}
      <Card testID="profile-balance">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="heading" style={{ flex: 1 }}>
            {t('admin.balance.title')}
          </Text>
          <Text variant="title" tone={owed > 0 ? 'warning' : 'secondary'} testID="profile-owed">
            {formatMoney(owed, theme.locale)}
          </Text>
        </View>

        <Text variant="caption" tone="tertiary" style={{ paddingTop: theme.spacing.xs }}>
          {t('admin.balance.neverBlocks')}
        </Text>

        <View style={{ paddingTop: theme.spacing.md }}>
          <Button
            label={t('admin.balance.addEntry')}
            onPress={openAdd}
            variant="secondary"
            testID="profile-add-entry"
          />
        </View>

        <View style={{ paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>
          {balance.isPending ? (
            <SkeletonCard testID="balance-loading" />
          ) : balance.isError ? (
            <ErrorState
              message={t(paymentErrorMessageKey(balance.error))}
              onRetry={refetch}
              isRetrying={balance.isFetching}
              testID="balance-list-error"
            />
          ) : entries.length === 0 ? (
            <EmptyState message={t('admin.balance.empty')} testID="balance-empty" />
          ) : (
            entries.map((entry) => (
              <View
                key={entry.id}
                testID={`balance-entry-${entry.id}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: theme.spacing.sm,
                  paddingVertical: theme.spacing.sm,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  {/* 10.3: "every entry with date, session, amount, and note". */}
                  <Text variant="small">
                    {entry.sessionLabel ?? t('admin.balance.manualEntry')}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {formatSessionDate(entry.createdAt, theme.locale)}
                  </Text>
                  {entry.note === null || entry.note === '' ? null : (
                    <Text variant="caption" tone="secondary">
                      {entry.note}
                    </Text>
                  )}
                </View>
                <Text
                  variant="small"
                  weight="600"
                  tone={entry.amountFils > 0 ? 'warning' : 'accent'}
                >
                  {formatMoney(entry.amountFils, theme.locale)}
                </Text>
                <Button
                  label={t('common.delete')}
                  onPress={() => setDeleting(entry)}
                  variant="ghost"
                  testID={`balance-delete-${entry.id}`}
                />
              </View>
            ))
          )}
        </View>
      </Card>

      {/* 15.8 section 7: "Last 20 bookings with payment outcomes." */}
      <Card testID="profile-recent-sessions">
        <Text variant="heading">{t('admin.profile.recentSessions.title')}</Text>

        <View style={{ paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>
          {recentSessions.isPending ? (
            <SkeletonCard testID="recent-sessions-loading" />
          ) : recentSessions.isError ? (
            <ErrorState
              message={t(paymentErrorMessageKey(recentSessions.error))}
              onRetry={refetch}
              isRetrying={recentSessions.isFetching}
              testID="recent-sessions-error"
            />
          ) : recentSessions.data === undefined || recentSessions.data.length === 0 ? (
            <EmptyState
              message={t('admin.profile.recentSessions.empty')}
              testID="recent-sessions-empty"
            />
          ) : (
            recentSessions.data.map((row) => (
              <RecentSessionRow
                key={row.bookingId}
                row={row}
                testID={`recent-session-${row.bookingId}`}
              />
            ))
          )}
        </View>
      </Card>

      {/* 15.8 section 8. D16: coach only, mirroring *Extend*'s own D55 gate —
          an admin is never even offered this, since the server refuses him
          regardless. */}
      {!isCoach || identity.data === undefined ? null : (
        <Card testID="profile-role">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="heading" style={{ flex: 1 }}>
              {t('admin.profile.role.title')}
            </Text>
            <Text variant="body" tone="secondary" testID="profile-role-current">
              {t(
                identity.data.role === 'coach'
                  ? 'admin.profile.role.coachLabel'
                  : 'admin.profile.role.playerLabel',
              )}
            </Text>
          </View>
          {identity.data.role === 'player' || identity.data.role === 'coach' ? (
            <View style={{ paddingTop: theme.spacing.sm }}>
              <Button
                label={t(
                  identity.data.role === 'coach'
                    ? 'admin.profile.role.demote'
                    : 'admin.profile.role.promote',
                )}
                onPress={openRoleConfirm}
                variant={identity.data.role === 'coach' ? 'destructive' : 'secondary'}
                testID="profile-role-toggle"
              />
            </View>
          ) : null}
          {setRole.isError ? (
            <Text variant="small" tone="danger" testID="profile-role-error">
              {t(paymentErrorMessageKey(setRole.error))}
            </Text>
          ) : null}
        </Card>
      )}

      {/* Mounted only while it is open, so its fields start empty every time. */}
      {isAdding ? (
        <BalanceEntrySheet playerId={playerId} currentOwedFils={owed} onClose={closeAdd} />
      ) : null}

      {extending === null ? null : (
        <ExtendSubscriptionSheet
          subscriptionId={extending.id}
          currentExpiresOn={extending.expiresOn}
          onClose={closeExtend}
        />
      )}

      {/* 17.4: every destructive action confirms. Deleting an entry cannot be
          undone and the entry is a record of money. */}
      <Dialog
        isVisible={deleting !== null}
        title={t('admin.balance.deleteTitle')}
        {...(deleting === null
          ? {}
          : {
              message: t('admin.balance.deleteBody', {
                amount: formatMoney(deleting.amountFils, theme.locale),
              }),
            })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={closeDelete}
        isConfirming={deleteEntry.isPending}
        isDestructive
        testID="balance-delete-dialog"
      />

      {/* 15.8 section 8, D16. Promoting and demoting both confirm: 17.4 asks
          it of every destructive action, and losing every coach power (or
          handing them out) is exactly that. */}
      {identity.data === undefined ? null : (
        <Dialog
          isVisible={isConfirmingRole}
          title={t(
            identity.data.role === 'coach'
              ? 'admin.profile.role.demoteTitle'
              : 'admin.profile.role.promoteTitle',
            { name: identity.data.fullName },
          )}
          message={t(
            identity.data.role === 'coach'
              ? 'admin.profile.role.demoteBody'
              : 'admin.profile.role.promoteBody',
          )}
          confirmLabel={t(
            identity.data.role === 'coach'
              ? 'admin.profile.role.demote'
              : 'admin.profile.role.promote',
          )}
          cancelLabel={t('common.cancel')}
          onConfirm={confirmRoleChange}
          onCancel={closeRoleConfirm}
          isConfirming={setRole.isPending}
          isDestructive={identity.data.role === 'coach'}
          testID="role-change-dialog"
        />
      )}
    </ScrollView>
  );
};

interface CustomRateSectionProps {
  playerId: string;
  identity: PlayerIdentity;
}

/**
 * 15.8 section 4. Local state rather than react-hook-form, the same shape as
 * `BalanceEntrySheet`'s two fields: this is one Save button, not a form with
 * cross-field validation. Blank means "use the session's list price" and
 * saves null; D41 says zero is a real rate, so it is never treated as blank.
 */
const CustomRateSection: React.FC<CustomRateSectionProps> = ({ playerId, identity }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const setRate = useSetPlayerRate();

  const toText = (value: Fils | null): string => (value === null ? '' : String(toJD(value)));

  const [standardText, setStandardText] = useState(() => toText(identity.customRateStandardFils));
  const [extendedText, setExtendedText] = useState(() => toText(identity.customRateExtendedFils));

  const toFilsOrNull = (text: string): Fils | null => (text.trim() === '' ? null : fils(Number(text)));

  const isDirty =
    standardText !== toText(identity.customRateStandardFils) ||
    extendedText !== toText(identity.customRateExtendedFils);

  const isValid =
    (standardText.trim() === '' || Number.isFinite(Number(standardText))) &&
    (extendedText.trim() === '' || Number.isFinite(Number(extendedText)));

  const save = useCallback((): void => {
    setRate.mutate({
      playerId,
      standardFils: toFilsOrNull(standardText),
      extendedFils: toFilsOrNull(extendedText),
    });
  }, [extendedText, playerId, setRate, standardText]);

  const resetToDefault = useCallback((): void => {
    setStandardText('');
    setExtendedText('');
    setRate.mutate({ playerId, standardFils: null, extendedFils: null });
  }, [playerId, setRate]);

  return (
    <Card testID="profile-rate">
      <Text variant="heading">{t('admin.profile.rate.title')}</Text>
      <Text variant="caption" tone="tertiary">
        {t('admin.profile.rate.hint')}
      </Text>

      <View style={{ paddingTop: theme.spacing.sm, gap: theme.spacing.sm }}>
        <NumericInput
          label={t('admin.profile.rate.standard')}
          value={standardText}
          onChangeText={setStandardText}
          suffix={t('common.jd')}
          testID="profile-rate-standard"
        />
        <NumericInput
          label={t('admin.profile.rate.extended')}
          value={extendedText}
          onChangeText={setExtendedText}
          suffix={t('common.jd')}
          testID="profile-rate-extended"
        />
      </View>

      {setRate.isError ? (
        <Text variant="small" tone="danger" testID="profile-rate-error">
          {t(paymentErrorMessageKey(setRate.error))}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
        }}
      >
        <Button
          label={t('common.save')}
          onPress={save}
          isDisabled={!isDirty || !isValid}
          isLoading={setRate.isPending}
          testID="profile-rate-save"
        />
        <Button
          label={t('admin.profile.rate.reset')}
          onPress={resetToDefault}
          variant="ghost"
          isDisabled={setRate.isPending}
          testID="profile-rate-reset"
        />
      </View>
    </Card>
  );
};

interface RecentSessionRowProps {
  row: PlayerRecentSession;
  testID: string;
}

/**
 * 15.8 section 7's row. Paid of expected, in that order, the same
 * `PaymentRow` reads them in — the coach is checking what arrived against
 * what was due, here as much as on the review screen itself.
 */
const RecentSessionRow: React.FC<RecentSessionRowProps> = ({ row, testID }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small" numberOfLines={2}>
          {row.venue}
        </Text>
        <Text variant="caption" tone="tertiary">
          {formatSessionDate(row.startsAt, theme.locale)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: theme.spacing.xs }}>
        <Text variant="small" weight="600" testID={`${testID}-amounts`}>
          {`${formatMoney(row.paidFils, theme.locale)} / ${formatMoney(
            row.expectedFils,
            theme.locale,
          )}`}
        </Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          <PaymentMethodChip method={row.paymentMethod} />
          <Chip
            label={t(statusLabelKey(row.paymentStatus))}
            tone={statusTone(row.paymentStatus)}
            testID={`${testID}-status`}
          />
        </View>
      </View>
    </View>
  );
};

export default PlayerProfileScreen;
