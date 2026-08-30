/**
 * Edit a dated session, and cancel one. BUILD-SPEC 15.4, 15.5 and 9.4.
 *
 * ── The capacity guard (15.4, A3) ─────────────────────────
 * The screen refuses the save before the server does, with the same sentence
 * and the same numbers, and offers a shortcut to the players tab. It **never**
 * removes anybody: deciding who loses a spot is the coach's call, not the
 * algorithm's. The server raises `capacity_below_bookings` too, and that is the
 * one that matters — this is only here so he does not have to make a round trip
 * to find out.
 *
 * ── Price changes (A7) ────────────────────────────────────
 * Every booking snapshotted `expected_fils` when it was made. Changing the
 * price rewrites nothing, and the confirmation dialog says so with the count.
 *
 * The price field is a `NumericInput` and the comparison that drives the
 * dialog goes through `parseFils`, for the reason `CreateSessionScreen`'s note
 * gives at length: `isPriceChanging` runs during render on every keystroke,
 * and `fils()` throws on a non-finite number by design (5.3), so a single
 * letter in the field took the screen down. The start time is picked from the
 * same 12 hour wheel as the create form, and for the same reason.
 *
 * ── Cancelling (15.5 and 9.4) ─────────────────────────────
 * The confirmation lists exactly what will happen: how many bookings are
 * cancelled, how many credits come back, and the reminder that **no
 * notification is sent**. That last line is D31 and it is deliberate, which is
 * why it is stated rather than left to be noticed.
 *
 * Afterwards the coach is offered the prefilled announcement composer from 9.4
 * step 6 and A6. Posting an announcement does push; cancelling does not. His
 * choice, one tap.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { OccupancyBar } from '@/components/domain';
import {
  Button,
  Card,
  Chip,
  Dialog,
  FormField,
  FormNumericInput,
  FormTimeField,
  Input,
  SegmentedControl,
  SkeletonCard,
  Text,
} from '@/components/primitives';
import { ErrorState } from '@/components/states';
import { cancellationAnnouncementParams } from '@/features/sessions/announcementDraft';
import { sessionErrorMessageKey, toAppSessionError } from '@/features/sessions/errors';
import { useCancelSession, useUpdateSession } from '@/features/sessions/mutations';
import { useSession } from '@/features/sessions/queries';
import {
  DURATIONS,
  editSessionSchema,
  type DurationMinutes,
  type EditSessionForm,
} from '@/features/sessions/schemas';
import type { Session } from '@/features/sessions/types';
import { fils, formatMoney, parseFils, toJD } from '@/lib/money';
import { formatSessionDate, formatSessionTime, TZ } from '@/lib/time';
import { useTheme } from '@/theme';
import { formatInTimeZone } from 'date-fns-tz';
import type { AdminScheduleStackParamList, AdminTabParamList } from '@/app/types';

import { isCancellable, isEditable, statusLabelKey, statusTone } from './sessionStatus';

type Props = NativeStackScreenProps<AdminScheduleStackParamList, 'SessionEdit'>;

const PLAYERS_PER_COURT = 4;

function durationOf(session: Session): DurationMinutes {
  const minutes = Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / (60 * 1000));
  return minutes === 150 ? 150 : 90;
}

export const SessionEditScreen: React.FC<Props> = ({ navigation, route }) => {
  const { sessionId } = route.params;
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSession(sessionId);

  const retry = useCallback((): void => {
    void session.refetch();
  }, [session]);

  if (session.isPending) {
    return (
      <View
        testID="session-edit-loading"
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
          message={t('session.loadError')}
          onRetry={retry}
          isRetrying={session.isFetching}
          testID="session-edit-error"
        />
      </View>
    );
  }

  return <SessionEditForm session={session.data} navigation={navigation} />;
};

interface FormProps {
  session: Session;
  navigation: Props['navigation'];
}

const SessionEditForm: React.FC<FormProps> = ({ session, navigation }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  // The announcement composer lives under the *More* tab (14.0), so reaching
  // it means addressing the tab navigator rather than this stack.
  const tabs = useNavigation<NavigationProp<AdminTabParamList>>();

  const update = useUpdateSession();
  const cancel = useCancelSession();

  const [duration, setDuration] = useState<DurationMinutes>(() => durationOf(session));
  const [isConfirmingPriceChange, setIsConfirmingPriceChange] = useState(false);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [isOfferingAnnouncement, setIsOfferingAnnouncement] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit, reset, formState } = useForm<EditSessionForm>({
    resolver: zodResolver(editSessionSchema),
    // Validates on blur, then on every keystroke. See CreateSessionScreen.
    mode: 'onTouched',
    defaultValues: {
      startTime: formatInTimeZone(session.startsAt, TZ, 'HH:mm'),
      priceJD: String(toJD(session.priceFils)),
      courtCount: String(session.courtCount),
      notes: session.notes ?? '',
    },
  });

  // useWatch rather than the form's own `watch`: the latter returns a fresh
  // function on every render, which the React Compiler cannot memoize.
  const courtCount = Number(useWatch({ control, name: 'courtCount' }));
  const priceJD = useWatch({ control, name: 'priceJD' });
  const startTime = useWatch({ control, name: 'startTime' });

  // A submit error — "another session already starts at this time", or the
  // capacity guard below — only means anything for the exact values it was
  // raised for. Adjusted during render rather than in an effect (React's
  // own pattern for this — see "You Might Not Need an Effect"), so it
  // takes hold the same frame the field changes. See the identical fix in
  // CreateSessionScreen.
  const errorKey = `${startTime}|${courtCount}`;
  const [lastErrorKey, setLastErrorKey] = useState(errorKey);
  if (errorKey !== lastErrorKey) {
    setLastErrorKey(errorKey);
    setSubmitError(null);
  }

  const booked = session.occupancy.taken;
  const proposedCapacity = Number.isFinite(courtCount) ? courtCount * PLAYERS_PER_COURT : 0;
  // A3: block the save, tell him to remove people first, remove nobody.
  const isBelowBookings = proposedCapacity < booked;
  const editedPriceFils = parseFils(priceJD);
  const isPriceChanging = editedPriceFils !== null && editedPriceFils !== session.priceFils;

  const editable = isEditable(session.status);
  const cancellable = isCancellable(session.status);

  // Composes 15.4/A3's capacity guard message with correct number agreement
  // in both languages: `count` drives English's "player is"/"players are",
  // and `courtsText`/`bookedText` carry their own noun (and, for Arabic,
  // adjective) agreement — reusing `session.courtsValue` and
  // `admin.error.playersBooked` rather than a bare `{{courts}}`/`{{booked}}`.
  const buildCapacityBelowBookingsMessage = useCallback(
    (courts: number): string =>
      t('admin.error.capacityBelowBookings', {
        count: booked,
        courtsText: t('session.courtsValue', { count: courts }),
        bookedText: t('admin.error.playersBooked', { count: booked }),
        capacity: courts * PLAYERS_PER_COURT,
      }),
    [booked, t],
  );

  const save = useCallback(
    (values: EditSessionForm): void => {
      setSubmitError(null);
      update.mutate(
        {
          sessionId: session.id,
          startTime: values.startTime,
          durationMinutes: duration,
          priceFils: fils(Number(values.priceJD)),
          courtCount: Number(values.courtCount),
          notes: values.notes.trim() === '' ? null : values.notes.trim(),
        },
        {
          onSuccess: () => {
            // Resetting to what was just saved clears isDirty, which is what
            // makes the confirmation below disappear the moment he edits again.
            reset(values);
            setIsConfirmingPriceChange(false);
          },
          onError: (error) => {
            const app = toAppSessionError(error);
            setSubmitError(
              app.code === 'capacity_below_bookings'
                ? buildCapacityBelowBookingsMessage(Number(values.courtCount))
                : t(app.messageKey),
            );
            setIsConfirmingPriceChange(false);
          },
        },
      );
    },
    [buildCapacityBelowBookingsMessage, duration, reset, session.id, t, update],
  );

  const onSubmit = useCallback(
    (values: EditSessionForm): void => {
      if (isBelowBookings) {
        setSubmitError(buildCapacityBelowBookingsMessage(Number(values.courtCount)));
        return;
      }

      // A7: the coach is told what a price change does and does not do before
      // it happens, not after.
      if (isPriceChanging && booked > 0) {
        setIsConfirmingPriceChange(true);
        return;
      }

      save(values);
    },
    [booked, buildCapacityBelowBookingsMessage, isBelowBookings, isPriceChanging, save],
  );

  const confirmCancel = useCallback((): void => {
    setSubmitError(null);
    cancel.mutate(
      { sessionId: session.id, note: cancelNote.trim() === '' ? null : cancelNote.trim() },
      {
        onSuccess: () => {
          setIsConfirmingCancel(false);
          // 9.4 step 6 and A6. No push was sent; this is the one deliberate tap.
          setIsOfferingAnnouncement(true);
        },
        onError: (error) => {
          setSubmitError(t(sessionErrorMessageKey(error)));
          setIsConfirmingCancel(false);
        },
      },
    );
  }, [cancel, cancelNote, session.id, t]);

  const announcementDraft = useMemo(
    () =>
      t(
        'admin.cancel.announcementDraft',
        cancellationAnnouncementParams({
          venueName: session.venue.name,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          locale: theme.locale,
        }),
      ),
    [session.endsAt, session.startsAt, session.venue.name, t, theme.locale],
  );

  const postAnnouncement = useCallback((): void => {
    setIsOfferingAnnouncement(false);
    // Phase 8 builds the composer; the draft rides along as a param so it only
    // has to read it.
    tabs.navigate('More', {
      screen: 'AnnouncementCompose',
      params: { draftBody: announcementDraft },
    });
  }, [announcementDraft, tabs]);

  const dismissAnnouncement = useCallback((): void => {
    setIsOfferingAnnouncement(false);
    navigation.goBack();
  }, [navigation]);

  const creditsToReturn = session.occupancy.taken;

  return (
    <ScrollView
      testID="session-edit"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
    >
      <Card testID="session-edit-summary">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="heading" style={{ flex: 1 }}>
            {session.venue.name}
          </Text>
          <Chip
            label={t(statusLabelKey(session.status))}
            tone={statusTone(session.status)}
            testID="session-edit-status"
          />
        </View>
        <Text variant="small" tone="secondary">
          {`${formatSessionDate(session.startsAt, theme.locale)} · ${formatSessionTime(
            session.startsAt,
            theme.locale,
          )}`}
        </Text>
        <OccupancyBar occupancy={session.occupancy} testID="session-edit-occupancy" />
      </Card>

      {editable ? null : (
        <Card testID="session-edit-readonly">
          <Text variant="body" tone="warning">
            {t(
              session.status === 'locked'
                ? 'admin.error.sessionLocked'
                : 'schedule.cancelledBanner',
            )}
          </Text>
        </Card>
      )}

      <Card>
        <Text variant="heading">{t('admin.edit.title')}</Text>

        <FormTimeField
          control={control}
          name="startTime"
          label={t('admin.edit.startTime')}
          doneLabel={t('common.done')}
          isDisabled={!editable}
          testID="edit-start-time"
        />
        <Text variant="caption" tone="tertiary">
          {t('admin.edit.timeChangeNote')}
        </Text>

        <SegmentedControl<DurationMinutes>
          label={t('admin.edit.duration')}
          options={DURATIONS.map((minutes) => ({
            value: minutes,
            label: t(minutes === 150 ? 'admin.edit.duration150' : 'admin.edit.duration90'),
          }))}
          value={duration}
          onChange={setDuration}
          isDisabled={!editable}
          testID="edit-duration"
        />

        <FormNumericInput
          control={control}
          name="priceJD"
          label={t('admin.edit.price')}
          suffix={t('common.jd')}
          hint={formatMoney(session.priceFils, theme.locale)}
          isDisabled={!editable}
          testID="edit-price"
        />

        <FormField
          control={control}
          name="courtCount"
          label={t('admin.edit.courtCount')}
          keyboardType="number-pad"
          isLTR
          isDisabled={!editable}
          testID="edit-court-count"
        />

        <Text
          variant="caption"
          tone={isBelowBookings ? 'danger' : 'tertiary'}
          testID="edit-capacity-note"
        >
          {t('admin.edit.capacityNote', {
            count: Number.isFinite(courtCount) ? courtCount : 0,
            courtsText: t('session.courtsValue', {
              count: Number.isFinite(courtCount) ? courtCount : 0,
            }),
            capacity: proposedCapacity,
            booked,
          })}
        </Text>

        <FormField
          control={control}
          name="notes"
          label={t('admin.edit.notes')}
          hint={t('common.optional')}
          multiline
          isDisabled={!editable}
          testID="edit-notes"
        />

        {submitError === null ? null : (
          <Text variant="small" tone="danger" testID="edit-error">
            {submitError}
          </Text>
        )}

        {update.isSuccess && !formState.isDirty ? (
          <Text variant="small" tone="accent" testID="edit-saved">
            {t('admin.edit.saved')}
          </Text>
        ) : null}

        <Button
          label={t('admin.edit.save')}
          onPress={handleSubmit(onSubmit)}
          isLoading={update.isPending}
          isDisabled={!editable}
          isFullWidth
          testID="edit-save"
        />
      </Card>

      {cancellable ? (
        <Button
          label={t('admin.schedule.cancel')}
          onPress={() => setIsConfirmingCancel(true)}
          variant="destructive"
          isFullWidth
          testID="edit-cancel-session"
        />
      ) : null}

      {/* A7: existing bookings keep the price they booked at, and he is told
          the number before he commits. */}
      <Dialog
        isVisible={isConfirmingPriceChange}
        title={t('admin.edit.priceChangeTitle')}
        message={t('admin.edit.priceChangeBody', { count: booked })}
        confirmLabel={t('common.save')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleSubmit(save)}
        onCancel={() => setIsConfirmingPriceChange(false)}
        isConfirming={update.isPending}
        testID="price-change-dialog"
      />

      {/* 15.5: exactly what will happen, including the absence of a push. */}
      <Dialog
        isVisible={isConfirmingCancel}
        title={t('admin.cancel.title')}
        confirmLabel={t('admin.cancel.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmCancel}
        onCancel={() => setIsConfirmingCancel(false)}
        isConfirming={cancel.isPending}
        isDestructive
        testID="cancel-session-dialog"
      >
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="body" testID="cancel-bookings-line">
            {t('admin.cancel.bookingsLine', { count: booked })}
          </Text>
          <Text variant="body" testID="cancel-credits-line">
            {t('admin.cancel.creditsLine', { count: creditsToReturn })}
          </Text>
          {/* D31. Stated, not implied. */}
          <Text variant="body" tone="warning" testID="cancel-no-push-line">
            {t('admin.cancel.noPushLine')}
          </Text>
          <Input
            label={t('admin.cancel.noteLabel')}
            value={cancelNote}
            onChangeText={setCancelNote}
            hint={t('common.optional')}
            testID="cancel-note"
          />
        </View>
      </Dialog>

      {/* 9.4 step 6, A6. */}
      <Dialog
        isVisible={isOfferingAnnouncement}
        title={t('admin.cancel.announceTitle')}
        message={t('admin.cancel.announceBody')}
        confirmLabel={t('admin.cancel.announcePost')}
        cancelLabel={t('common.notNow')}
        onConfirm={postAnnouncement}
        onCancel={dismissAnnouncement}
        testID="announcement-prompt"
      >
        <Text variant="small" tone="secondary" testID="announcement-draft">
          {announcementDraft}
        </Text>
      </Dialog>
    </ScrollView>
  );
};

export default SessionEditScreen;
