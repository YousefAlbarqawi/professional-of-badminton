/**
 * Session manage. BUILD-SPEC 15.2.
 *
 * "The operational hub for one session. Tabs: Players, Court board, Money."
 *
 * Phase 4 built the players tab, phase 5 the money tab, and phase 7 the court
 * board (13.10).
 *
 * ── The players tab ───────────────────────────────────────
 * "The attendee list with tier badges and payment method chips. Header
 * buttons: Add player, Add guest, Add coach. Swipe or long press a row for
 * Remove, Change tier, Move to another session."
 *
 * Remove, Move to another session and Change tier are all built, in
 * `RowActionsSheet`, `MoveBookingSheet` and `ChangeTierSheet`.
 *
 * The row gesture is a tap rather than a swipe or a long press. Phase 7 has
 * since brought `react-native-gesture-handler` in for the court board, but the
 * reason the tap was chosen still holds: it is the same number of deliberate
 * actions and it works with a screen reader, which a swipe does not. A tap now
 * opens `RowActionsSheet` rather than jumping straight to Remove, because
 * there are two destinations instead of one.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { OccupancyBar, PaymentMethodChip, PlayerRow } from '@/components/domain';
import { Button, Card, Chip, SegmentedControl, SkeletonCard, Text } from '@/components/primitives';
import { EmptyState, ErrorState } from '@/components/states';
import { useSessionRoster } from '@/features/bookings/queries';
import type { RosterEntry } from '@/features/bookings/types';
import { sessionErrorMessageKey } from '@/features/sessions/errors';
import { useSession } from '@/features/sessions/queries';
import type { Session } from '@/features/sessions/types';
import { formatSessionDate, formatSessionTimeRange, nowInAmman } from '@/lib/time';
import { useTheme } from '@/theme';
import type { AdminTabParamList, TodayStackParamList } from '@/app/types';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { SessionCourtBoardTab } from './SessionCourtBoardTab';
import { SessionMoneyTab } from './SessionMoneyTab';
import { AddCoachSheet } from './AddCoachSheet';
import { AddGuestSheet } from './AddGuestSheet';
import { AddPlayerSheet } from './AddPlayerSheet';
import { ChangeTierSheet } from './ChangeTierSheet';
import { MoveBookingSheet } from './MoveBookingSheet';
import { RemoveBookingDialog } from './RemoveBookingDialog';
import { RowActionsSheet } from './RowActionsSheet';
import { statusLabelKey, statusTone } from './sessionStatus';

type Props = NativeStackScreenProps<TodayStackParamList, 'SessionManage'>;

type ManageTab = 'players' | 'courtBoard' | 'money';

export const SessionManageScreen: React.FC<Props> = ({ route, navigation }) => {
  const { sessionId, tab: initialTab } = route.params;
  const { t } = useTranslation();
  const theme = useTheme();

  const session = useSession(sessionId);

  const retry = useCallback((): void => {
    void session.refetch();
  }, [session]);

  if (session.isPending) {
    return (
      <View
        testID="manage-loading"
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (session.isError || session.data === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}>
        <ErrorState
          message={t('admin.manage.loadError')}
          onRetry={retry}
          isRetrying={session.isFetching}
          testID="manage-error"
        />
      </View>
    );
  }

  return (
    <SessionManageContent
      session={session.data}
      navigation={navigation}
      initialTab={initialTab ?? 'players'}
    />
  );
};

const SessionManageContent: React.FC<{
  session: Session;
  navigation: Props['navigation'];
  /** 15.1's court board shortcut opens straight on the board. */
  initialTab: ManageTab;
}> = ({ session, navigation, initialTab }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const roster = useSessionRoster(session.id);

  const [tab, setTab] = useState<ManageTab>(initialTab);
  const [openSheet, setOpenSheet] = useState<'player' | 'guest' | 'coach' | null>(null);
  const [removing, setRemoving] = useState<RosterEntry | null>(null);
  // 15.2's players-tab row menu: Move to another session, or Remove. `moving`
  // and `actionsFor` are deliberately separate from `removing` above, which
  // stays wired directly from the Money tab's own "Remove from session" — a
  // single-purpose review action, not an ambiguous row tap, so it skips the
  // menu entirely.
  const [actionsFor, setActionsFor] = useState<RosterEntry | null>(null);
  const [moving, setMoving] = useState<RosterEntry | null>(null);
  const [changingTier, setChangingTier] = useState<RosterEntry | null>(null);

  const tabs = useMemo(
    () => [
      { value: 'players' as const, label: t('admin.manage.tabPlayers') },
      { value: 'courtBoard' as const, label: t('admin.manage.tabCourtBoard') },
      { value: 'money' as const, label: t('admin.manage.tabMoney') },
    ],
    [t],
  );

  const openPlayerProfile = useCallback(
    (playerId: string): void => navigation.navigate('PlayerProfile', { playerId }),
    [navigation],
  );

  /**
   * 13.7's empty board offers a *Cancel session* button. Cancelling lives on
   * 15.4's edit screen, in the schedule stack, and 9.4's whole flow — the note,
   * the credit returns, the announcement prompt — is built there. So this
   * crosses to it rather than growing a second cancel path here.
   */
  const openSessionEdit = useCallback((): void => {
    navigation
      .getParent<BottomTabNavigationProp<AdminTabParamList>>()
      ?.navigate('AdminSchedule', { screen: 'SessionEdit', params: { sessionId: session.id } });
  }, [navigation, session.id]);

  const closeSheet = useCallback((): void => setOpenSheet(null), []);
  const closeRemove = useCallback((): void => setRemoving(null), []);
  const openPlayer = useCallback((): void => setOpenSheet('player'), []);
  const openGuest = useCallback((): void => setOpenSheet('guest'), []);
  const openCoach = useCallback((): void => setOpenSheet('coach'), []);

  const closeActions = useCallback((): void => setActionsFor(null), []);
  const closeMove = useCallback((): void => setMoving(null), []);
  const closeChangeTier = useCallback((): void => setChangingTier(null), []);
  const selectRemove = useCallback((): void => {
    setRemoving(actionsFor);
    setActionsFor(null);
  }, [actionsFor]);
  const selectMove = useCallback((): void => {
    setMoving(actionsFor);
    setActionsFor(null);
  }, [actionsFor]);
  const selectChangeTier = useCallback((): void => {
    setChangingTier(actionsFor);
    setActionsFor(null);
  }, [actionsFor]);

  const refetch = useCallback((): void => {
    void roster.refetch();
  }, [roster]);

  const entries = roster.data ?? [];
  // D30: capacity is hard, so the header says how close to it he is and the
  // add buttons stop when it is reached. The server refuses either way.
  const isFull = entries.length >= session.occupancy.capacity;

  return (
    <ScrollView
      testID="session-manage"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
      refreshControl={
        <RefreshControl
          refreshing={roster.isFetching}
          onRefresh={refetch}
          tintColor={theme.colors.textSecondary}
        />
      }
    >
      <Card testID="manage-summary">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="title" style={{ flex: 1 }}>
            {session.venue.name}
          </Text>
          <Chip label={t(statusLabelKey(session.status))} tone={statusTone(session.status)} />
        </View>
        <Text variant="body" tone="secondary">
          {`${formatSessionDate(session.startsAt, theme.locale)} · ${formatSessionTimeRange(
            session.startsAt,
            session.endsAt,
            theme.locale,
          )}`}
        </Text>
        <View style={{ paddingTop: theme.spacing.sm }}>
          <OccupancyBar
            occupancy={{
              ...session.occupancy,
              taken: entries.length,
              remaining: session.occupancy.capacity - entries.length,
            }}
            testID="manage-occupancy"
          />
        </View>
      </Card>

      <SegmentedControl
        label={t('admin.manage.title')}
        options={tabs}
        value={tab}
        onChange={setTab}
        testID="manage-tabs"
      />

      {tab === 'courtBoard' ? (
        // 13.10. D68 keeps it to staff, and D18 keeps players out of the
        // tables underneath whatever a screen asks for.
        <SessionCourtBoardTab session={session} onCancelSession={openSessionEdit} />
      ) : tab === 'money' ? (
        // 10.2, and it owns 15.2's remove dialog rather than a second one of
        // its own: *Remove from session* is the same act with the same credit
        // return prompt behind it, wherever it is reached from.
        <SessionMoneyTab
          session={session}
          onRemove={setRemoving}
          onOpenPlayer={openPlayerProfile}
        />
      ) : (
        <View style={{ gap: theme.spacing.md }} testID="manage-players">
          {/* 15.2's header buttons. D22 lets him add at any time, including
              after the cutoff and during the session, so these are never
              disabled by the clock — only by capacity. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Button
              label={t('admin.manage.addPlayer')}
              onPress={openPlayer}
              isDisabled={isFull}
              testID="manage-add-player"
            />
            <Button
              label={t('admin.manage.addGuest')}
              onPress={openGuest}
              variant="secondary"
              isDisabled={isFull}
              testID="manage-add-guest"
            />
            <Button
              label={t('admin.manage.addCoach')}
              onPress={openCoach}
              variant="secondary"
              isDisabled={isFull}
              testID="manage-add-coach"
            />
          </View>

          {isFull ? (
            <Text variant="small" tone="warning" testID="manage-full">
              {t('admin.error.sessionFull')}
            </Text>
          ) : null}

          {roster.isPending ? (
            <SkeletonCard testID="roster-loading" />
          ) : roster.isError ? (
            <ErrorState
              message={t(sessionErrorMessageKey(roster.error))}
              onRetry={refetch}
              isRetrying={roster.isFetching}
              testID="roster-error"
            />
          ) : entries.length === 0 ? (
            <EmptyState message={t('admin.manage.empty')} testID="roster-empty" />
          ) : (
            <Card>
              {entries.map((entry) => (
                <PlayerRow
                  key={entry.bookingId}
                  name={entry.displayName}
                  tier={entry.tier}
                  caption={
                    entry.kind === 'guest'
                      ? t('admin.manage.guestLabel')
                      : entry.kind === 'coach'
                        ? t('admin.manage.coachLabel')
                        : undefined
                  }
                  trailing={<PaymentMethodChip method={entry.paymentMethod} />}
                  onPress={() => setActionsFor(entry)}
                  testID={`roster-row-${entry.bookingId}`}
                />
              ))}
            </Card>
          )}
        </View>
      )}

      <AddPlayerSheet
        isVisible={openSheet === 'player'}
        sessionId={session.id}
        onClose={closeSheet}
      />
      <AddGuestSheet
        isVisible={openSheet === 'guest'}
        sessionId={session.id}
        sessionPriceFils={session.priceFils}
        onClose={closeSheet}
      />
      <AddCoachSheet
        isVisible={openSheet === 'coach'}
        sessionId={session.id}
        onClose={closeSheet}
      />

      <RemoveBookingDialog
        entry={removing}
        sessionId={session.id}
        sessionStartsAt={session.startsAt}
        now={nowInAmman()}
        onClose={closeRemove}
      />

      <RowActionsSheet
        entry={actionsFor}
        onClose={closeActions}
        onSelectMove={selectMove}
        onSelectChangeTier={selectChangeTier}
        onSelectRemove={selectRemove}
      />
      <MoveBookingSheet entry={moving} sourceSession={session} onClose={closeMove} />
      <ChangeTierSheet entry={changingTier} onClose={closeChangeTier} />
    </ScrollView>
  );
};

export default SessionManageScreen;
