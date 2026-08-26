/**
 * Session detail. BUILD-SPEC 14.7.
 *
 * Two tables drive this screen and both are implemented literally.
 *
 * ── The attendee section, by visibility level ─────────────
 *   0  "9 players booked. 7 spots left." Nothing else. Not even a list of
 *      anonymous rows.
 *   1  A grid of tier badges only, sorted strongest first, own badge outlined.
 *   2  A list of names with tier badges, in booking order, own row highlighted.
 *
 * The level is not a rendering preference. `get_session_attendees` decides what
 * this screen is allowed to know (7.2), and at level 0 it hands back a single
 * row with the name and tier nulled. The level is read here only to choose
 * between three layouts for data the server has already redacted.
 *
 * Never any court information, at any level. D18.
 *
 * ── The primary action, by state ──────────────────────────
 * Eight states, enumerated and given a precedence in
 * features/sessions/sessionState.ts. Read the comment there for why 14.7's
 * seven rows become eight.
 *
 * ── The actions themselves (phase 4) ──────────────────────
 * *Reserve a spot* opens 14.8's sheet. *Join* and *Leave the waiting list*
 * call their RPCs directly — neither is destructive and neither needs a
 * confirmation. *Cancel my reservation* asks first, because 17.4 requires
 * every destructive action to confirm and this one cannot be undone inside the
 * last three hours.
 *
 * Section 18 puts the notification permission request at the moment he joins a
 * waiting list, "not on first launch", so that is where it is asked. A refusal
 * changes nothing about the join: he is on the list either way, and the app
 * says plainly what he will miss.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { OccupancyBar, TierBadge } from '@/components/domain';
import {
  Button,
  Card,
  Chip,
  Dialog,
  SkeletonCard,
  Text,
  WhatsAppButton,
} from '@/components/primitives';
import { ErrorState } from '@/components/states';
import { bookingErrorMessageKey } from '@/features/bookings/errors';
import { useCancelBooking, useJoinWaitlist, useLeaveWaitlist } from '@/features/bookings/mutations';
import { useMySessionStanding } from '@/features/bookings/queries';
import { requestNotificationPermission } from '@/features/notifications/permissions';
import { syncDeviceToken } from '@/features/notifications/registration';
import { isOfflineError } from '@/features/sessions/errors';
import { resolvePrice } from '@/features/sessions/pricing';
import { useMyBookingProfile, useSession, useSessionAttendees } from '@/features/sessions/queries';
import { sessionActionState, type SessionActionState } from '@/features/sessions/sessionState';
import type { Attendee, Session, VisibilityLevel } from '@/features/sessions/types';
import { formatMoney } from '@/lib/money';
import { compareTiersDescending } from '@/lib/tiers';
import {
  formatSessionDate,
  formatSessionTime,
  formatSessionTimeRange,
  nowInAmman,
} from '@/lib/time';
import { useTheme } from '@/theme';
import type { ScheduleStackParamList } from '@/app/types';

import { BookingConfirmSheet } from './BookingConfirmSheet';

type Props = NativeStackScreenProps<ScheduleStackParamList, 'SessionDetail'>;

interface FactRowProps {
  label: string;
  value: string;
  testID?: string;
}

const FactRow: React.FC<FactRowProps> = ({ label, value, testID }) => (
  <View style={{ gap: 2 }} testID={testID}>
    <Text variant="caption" tone="tertiary">
      {label}
    </Text>
    <Text variant="body">{value}</Text>
  </View>
);

/**
 * Level 0. A count and nothing else — deliberately not a list of blank rows,
 * because a row per person is itself information about who is coming.
 */
const AttendeesLevel0: React.FC<{ taken: number }> = ({ taken }) => {
  const { t } = useTranslation();

  return (
    <Text variant="body" tone="secondary" testID="attendees-level-0">
      {t('session.attendeesLevel0', { count: taken })}
    </Text>
  );
};

/** Level 1. Tier badges only, strongest first, the player's own outlined. */
const AttendeesLevel1: React.FC<{ attendees: Attendee[] }> = ({ attendees }) => {
  const theme = useTheme();

  const sorted = useMemo(
    () =>
      [...attendees].sort((a, b) => {
        if (a.tier === null) return 1;
        if (b.tier === null) return -1;
        return compareTiersDescending(a.tier, b.tier);
      }),
    [attendees],
  );

  return (
    <View
      testID="attendees-level-1"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
    >
      {sorted.map((attendee) => (
        <TierBadge
          key={attendee.bookingId}
          tier={attendee.tier}
          isSelf={attendee.isSelf}
          testID={`attendee-tier-${attendee.bookingId}`}
        />
      ))}
    </View>
  );
};

/** Level 2. Names with tier badges, in booking order, own row highlighted. */
const AttendeesLevel2: React.FC<{ attendees: Attendee[] }> = ({ attendees }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View testID="attendees-level-2" style={{ gap: theme.spacing.sm }}>
      {attendees.map((attendee) => (
        <View
          key={attendee.bookingId}
          testID={`attendee-row-${attendee.bookingId}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: attendee.isSelf ? theme.spacing.sm : 0,
            borderRadius: theme.radii.sm,
            backgroundColor: attendee.isSelf ? theme.colors.bgSurface : 'transparent',
          }}
        >
          <TierBadge tier={attendee.tier} isSelf={attendee.isSelf} />
          <Text variant="body" style={{ flex: 1 }}>
            {attendee.displayName ?? ''}
          </Text>
          {attendee.isSelf ? <Chip label={t('session.yourSpot')} tone="accent" /> : null}
        </View>
      ))}
    </View>
  );
};

interface PrimaryActionProps {
  state: SessionActionState;
  cancellationNote: string | null;
  /** 14.8's sheet, opened from *Reserve a spot*. */
  onReserve: () => void;
  onCancel: () => void;
  onJoinWaitlist: () => void;
  onLeaveWaitlist: () => void;
  isBusy: boolean;
  /** Set after a join, so section 18's copy can appear under the button. */
  notificationHint: string | null;
}

/**
 * 14.7's action table, one branch per state. The two disabled buttons stay
 * disabled: they are the states where the app deliberately offers the player
 * nothing but a way to reach the coach (D24, D21).
 */
const PrimaryAction: React.FC<PrimaryActionProps> = ({
  state,
  cancellationNote,
  onReserve,
  onCancel,
  onJoinWaitlist,
  onLeaveWaitlist,
  isBusy,
  notificationHint,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const noop = useCallback((): void => undefined, []);

  const gap = { gap: theme.spacing.sm };

  switch (state) {
    case 'cancelled':
      return (
        <View style={gap} testID="action-cancelled">
          <Card style={{ borderColor: theme.colors.danger }}>
            <Text variant="heading" tone="danger">
              {t('schedule.cancelledBanner')}
            </Text>
            {cancellationNote === null || cancellationNote.trim() === '' ? null : (
              <Text variant="small" tone="secondary">
                {t('session.cancelledNote', { note: cancellationNote })}
              </Text>
            )}
          </Card>
          <WhatsAppButton isFullWidth />
        </View>
      );

    case 'ended':
      return (
        <View style={gap} testID="action-ended">
          <Text variant="body" tone="secondary">
            {t('session.ended')}
          </Text>
          <WhatsAppButton isFullWidth />
        </View>
      );

    case 'booked_cancellable':
      return (
        <View style={gap} testID="action-booked-cancellable">
          <Chip label={t('schedule.booked')} tone="accent" />
          <Button
            label={t('session.cancelReservation')}
            onPress={onCancel}
            variant="secondary"
            isLoading={isBusy}
            isFullWidth
            testID="action-button"
          />
        </View>
      );

    case 'booked_locked':
      return (
        <View style={gap} testID="action-booked-locked">
          <Chip label={t('schedule.booked')} tone="accent" />
          {/* D24: inside the last three hours only the coach can remove him,
              so the button is replaced by the way to reach the coach. */}
          <Button
            label={t('session.cancelReservation')}
            onPress={noop}
            variant="secondary"
            isDisabled
            isFullWidth
            testID="action-button"
          />
          <Text variant="small" tone="secondary">
            {t('session.cancelWindowClosed')}
          </Text>
          <WhatsAppButton isFullWidth />
        </View>
      );

    case 'closed':
      return (
        <View style={gap} testID="action-closed">
          <Button
            label={t('schedule.closed')}
            onPress={noop}
            isDisabled
            isFullWidth
            testID="action-button"
          />
          <Text variant="small" tone="secondary">
            {t('session.bookingClosed')}
          </Text>
          <WhatsAppButton isFullWidth />
        </View>
      );

    case 'on_waitlist':
      return (
        <View style={gap} testID="action-on-waitlist">
          <Button
            label={t('session.leaveWaitlist')}
            onPress={onLeaveWaitlist}
            variant="secondary"
            isLoading={isBusy}
            isFullWidth
            testID="action-button"
          />
          <Text variant="small" tone="secondary">
            {t('session.waitlistExplain')}
          </Text>
        </View>
      );

    case 'full':
      return (
        <View style={gap} testID="action-full">
          <Button
            label={t('session.joinWaitlist')}
            onPress={onJoinWaitlist}
            isLoading={isBusy}
            isFullWidth
            testID="action-button"
          />
          <Text variant="small" tone="secondary">
            {t('session.waitlistExplain')}
          </Text>
          {/* Section 18: if permission is denied the waiting list still works
              and the app says so plainly. */}
          {notificationHint === null ? null : (
            <Text variant="small" tone="warning" testID="waitlist-notification-hint">
              {notificationHint}
            </Text>
          )}
        </View>
      );

    case 'open':
      return (
        <View style={gap} testID="action-open">
          <Button
            label={t('session.reserve')}
            onPress={onReserve}
            isFullWidth
            testID="action-button"
          />
        </View>
      );
  }
};

interface AttendeeSectionProps {
  visibility: VisibilityLevel;
  attendees: Attendee[];
  taken: number;
}

const AttendeeSection: React.FC<AttendeeSectionProps> = ({ visibility, attendees, taken }) => {
  const { t } = useTranslation();

  if (visibility === 'level_0') {
    return (
      <Card testID="attendees">
        <Text variant="heading">{t('session.attendees')}</Text>
        <AttendeesLevel0 taken={taken} />
        <Text variant="caption" tone="tertiary">
          {t('session.attendeesHidden')}
        </Text>
      </Card>
    );
  }

  const heading = visibility === 'level_1' ? 'session.attendeesLevel1' : 'session.attendeesLevel2';

  return (
    <Card testID="attendees">
      <Text variant="heading">{t(heading)}</Text>
      {attendees.length === 0 ? (
        <Text variant="body" tone="secondary" testID="attendees-empty">
          {t('session.attendeesEmpty')}
        </Text>
      ) : visibility === 'level_1' ? (
        <AttendeesLevel1 attendees={attendees} />
      ) : (
        <AttendeesLevel2 attendees={attendees} />
      )}
    </Card>
  );
};

export const SessionDetailScreen: React.FC<Props> = ({ route }) => {
  const { sessionId } = route.params;
  const { t } = useTranslation();
  const theme = useTheme();

  const session = useSession(sessionId);
  const attendees = useSessionAttendees(sessionId);
  const standing = useMySessionStanding(sessionId);
  const profile = useMyBookingProfile();

  const openMaps = useCallback((): void => {
    const url = session.data?.venue.googleMapsUrl;
    if (url === undefined || url === null || url === '') return;
    void Linking.openURL(url);
  }, [session.data?.venue.googleMapsUrl]);

  const retry = useCallback((): void => {
    void session.refetch();
    void attendees.refetch();
  }, [attendees, session]);

  if (session.isPending) {
    return (
      <View
        testID="session-loading"
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
          message={
            isOfflineError(session.error) ? t('schedule.offlineBanner') : t('session.loadError')
          }
          onRetry={retry}
          isRetrying={session.isFetching}
          testID="session-error"
        />
      </View>
    );
  }

  return (
    <SessionDetailContent
      session={session.data}
      attendees={attendees.data ?? []}
      visibility={profile.data?.visibility ?? 'level_0'}
      isBooked={standing.data?.isBooked ?? false}
      bookingId={standing.data?.bookingId ?? null}
      isOnWaitlist={standing.data?.isOnWaitlist ?? false}
      customRates={profile.data}
      onOpenMaps={openMaps}
    />
  );
};

interface ContentProps {
  session: Session;
  attendees: Attendee[];
  visibility: VisibilityLevel;
  isBooked: boolean;
  bookingId: string | null;
  isOnWaitlist: boolean;
  customRates: Parameters<typeof resolvePrice>[0];
  onOpenMaps: () => void;
}

const SessionDetailContent: React.FC<ContentProps> = ({
  session,
  attendees,
  visibility,
  isBooked,
  bookingId,
  isOnWaitlist,
  customRates,
  onOpenMaps,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [notificationHint, setNotificationHint] = useState<string | null>(null);

  const cancelBooking = useCancelBooking();
  const joinWaitlist = useJoinWaitlist();
  const leaveWaitlist = useLeaveWaitlist();

  const state = useMemo(
    () =>
      sessionActionState({
        status: session.status,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        remaining: session.occupancy.remaining,
        isBooked,
        isOnWaitlist,
        now: nowInAmman(),
      }),
    [isBooked, isOnWaitlist, session],
  );

  const openSheet = useCallback((): void => setIsSheetOpen(true), []);
  const closeSheet = useCallback((): void => setIsSheetOpen(false), []);

  /**
   * Section 18: the permission request belongs here, the first time he joins a
   * waiting list. The join is not conditional on the answer — he is on the
   * list either way — so it goes first and the prompt follows.
   *
   * Granting is also the first moment this phone can produce a push token, and
   * `useDeviceTokenRegistration` will not try again until the next cold start.
   * Waiting for that would mean missing the spot he joined the list for, so
   * the token is registered here, immediately, on a yes.
   */
  const join = useCallback((): void => {
    joinWaitlist.mutate(session.id, {
      onSuccess: () => {
        void requestNotificationPermission().then((granted) => {
          setNotificationHint(granted ? null : t('notifications.enablePrompt'));
          if (granted) void syncDeviceToken();
        });
      },
    });
  }, [joinWaitlist, session.id, t]);

  const leave = useCallback((): void => {
    setNotificationHint(null);
    leaveWaitlist.mutate(session.id);
  }, [leaveWaitlist, session.id]);

  /** 14.8's sheet again, from the *Join the waiting list* on a lost race. */
  const joinFromSheet = useCallback((): void => {
    setIsSheetOpen(false);
    join();
  }, [join]);

  // 17.4: every destructive action confirms. Cancelling cannot be undone once
  // the three hour window closes behind him.
  const askToCancel = useCallback((): void => setIsConfirmingCancel(true), []);
  const dismissCancel = useCallback((): void => setIsConfirmingCancel(false), []);

  const confirmCancel = useCallback((): void => {
    if (bookingId === null) return;
    cancelBooking.mutate(bookingId, { onSuccess: () => setIsConfirmingCancel(false) });
  }, [bookingId, cancelBooking]);

  // D41 and 14.6: his rate when he has one, with no explanation of why it
  // differs from the poster price. He knows.
  const { payableFils } = resolvePrice(customRates, session.sessionType, session.priceFils);
  const hasMaps = session.venue.googleMapsUrl !== null && session.venue.googleMapsUrl !== '';

  return (
    <ScrollView
      testID="session-detail"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
    >
      <Card testID="session-summary">
        <Text variant="title">{session.venue.name}</Text>
        <Text variant="body" tone="secondary">
          {session.venue.area}
        </Text>

        {hasMaps ? (
          <Button
            label={t('session.openMaps')}
            onPress={onOpenMaps}
            variant="ghost"
            testID="session-open-maps"
          />
        ) : null}

        <View style={{ gap: theme.spacing.sm, paddingTop: theme.spacing.sm }}>
          <FactRow
            label={t('session.when')}
            value={`${formatSessionDate(session.startsAt, theme.locale)} · ${formatSessionTimeRange(
              session.startsAt,
              session.endsAt,
              theme.locale,
            )}`}
            testID="fact-when"
          />
          <FactRow
            label={t('session.duration')}
            value={t(session.sessionType === 'extended' ? 'session.extended' : 'session.standard')}
            testID="fact-duration"
          />
          <FactRow
            label={t('session.courts')}
            value={t('session.courtsValue', { count: session.courtCount })}
            testID="fact-courts"
          />
          <FactRow
            label={t('session.price')}
            value={formatMoney(payableFils, theme.locale)}
            testID="fact-price"
          />
        </View>

        {session.status === 'cancelled' ? null : (
          <View style={{ paddingTop: theme.spacing.sm }}>
            <OccupancyBar occupancy={session.occupancy} testID="session-occupancy" />
          </View>
        )}
      </Card>

      <AttendeeSection
        visibility={visibility}
        attendees={attendees}
        taken={session.occupancy.taken}
      />

      <PrimaryAction
        state={state}
        cancellationNote={session.cancellationNote}
        onReserve={openSheet}
        onCancel={askToCancel}
        onJoinWaitlist={join}
        onLeaveWaitlist={leave}
        isBusy={joinWaitlist.isPending || leaveWaitlist.isPending || cancelBooking.isPending}
        notificationHint={notificationHint}
      />

      {/* A join or a leave that the server refused. The cancel path has the
          dialog to say it in; these two have nowhere else. */}
      {joinWaitlist.isError || leaveWaitlist.isError ? (
        <Chip
          label={t(bookingErrorMessageKey(joinWaitlist.error ?? leaveWaitlist.error))}
          tone="danger"
          testID="waitlist-error"
        />
      ) : null}

      {/* D72: reachable from almost every screen. The states that already draw
          their own WhatsApp button do not get a second one. */}
      {state === 'cancelled' ||
      state === 'ended' ||
      state === 'closed' ||
      state === 'booked_locked' ? null : (
        <WhatsAppButton isFullWidth />
      )}

      <BookingConfirmSheet
        isVisible={isSheetOpen}
        session={session}
        payableFils={payableFils}
        onClose={closeSheet}
        onJoinWaitlist={joinFromSheet}
      />

      <Dialog
        isVisible={isConfirmingCancel}
        title={t('session.cancelTitle')}
        message={t('session.cancelBody', {
          venue: session.venue.name,
          time: formatSessionTime(session.startsAt, theme.locale),
        })}
        confirmLabel={t('session.cancelConfirm')}
        cancelLabel={t('session.cancelKeep')}
        onConfirm={confirmCancel}
        onCancel={dismissCancel}
        isConfirming={cancelBooking.isPending}
        isDestructive
        testID="cancel-dialog"
      >
        {cancelBooking.isError ? (
          <Text variant="small" tone="danger" testID="cancel-error">
            {t(bookingErrorMessageKey(cancelBooking.error))}
          </Text>
        ) : null}
      </Dialog>
    </ScrollView>
  );
};

export default SessionDetailScreen;
