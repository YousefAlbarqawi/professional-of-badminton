/**
 * Create a one-off session. BUILD-SPEC 15.6.
 *
 * "Venue, date, start time, duration (90 or 150), price, court count, rotation
 * count. No recurrence option; one-off means one-off. Used for extra games,
 * not tournaments, which do not exist in the app." (D9.)
 *
 * The court count defaults to the venue's, because D4 says every court at a
 * venue is rented for the whole night, so anything less is the exception. The
 * rotation count follows the duration (D5) until the coach overrides it.
 *
 * The venues are loaded by the outer component and handed to the form, so the
 * form's defaults are already right at mount and nothing has to be corrected
 * by an effect afterwards.
 *
 * The date is picked, not typed — A35's amendment to 2.1, phase 10, once the
 * client approved the dependency. See OPEN-ITEMS.md.
 *
 * The start time is picked too, from the same native module, and reads back as
 * "7:00 PM" / "7:00 مساءً" rather than as 24 hour `HH:mm` — see `TimeField`
 * for why. The coach reads a 12 hour clock everywhere else in the app (16.1)
 * and was converting in his head to type into this one field.
 *
 * ── A form that cannot be crashed ─────────────────────────
 * The summary line under the fields prices the session as it is typed, which
 * means `fils()` ran on a half-typed value on every keystroke — and `fils()`
 * throws on a non-finite number by design (5.3). A single letter in the price
 * field took the whole screen down before the schema could report it. Two
 * things fixed that, and both are wanted: the money field is a `NumericInput`,
 * so only digits and one separator reach the form at all, and the preview goes
 * through `parseFils`, which answers `null` for a value that is not a number
 * yet instead of throwing. The schema is unchanged and still has the last word.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  FormDateField,
  FormField,
  FormNumericInput,
  FormTimeField,
  SegmentedControl,
  SkeletonCard,
  Text,
} from '@/components/primitives';
import { ErrorState } from '@/components/states';
import { sessionErrorMessageKey } from '@/features/sessions/errors';
import { useCreateOneOffSession } from '@/features/sessions/mutations';
import { useVenues } from '@/features/sessions/queries';
import {
  DURATIONS,
  createSessionSchema,
  defaultRotationCount,
  type CreateSessionForm,
  type DurationMinutes,
} from '@/features/sessions/schemas';
import type { VenueOption } from '@/features/sessions/types';
import { fils, formatMoney, parseFils } from '@/lib/money';
import {
  ammanDayKey,
  ammanDayStart,
  formatClockTime,
  formatSessionDate,
  nowInAmman,
} from '@/lib/time';
import { useTheme } from '@/theme';
import type { AdminScheduleStackParamList } from '@/app/types';

type Props = NativeStackScreenProps<AdminScheduleStackParamList, 'CreateSession'>;
type Prefill = NonNullable<Props['route']['params']>;

const PLAYERS_PER_COURT = 4;
const DEFAULT_START_TIME = '19:00';

/** The two wire formats the pickers write, for the summary line below. */
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DEFAULT_PRICE_JD = '6';
const DEFAULT_DURATION: DurationMinutes = 90;

export const CreateSessionScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const venues = useVenues();

  const retry = useCallback((): void => {
    void venues.refetch();
  }, [venues]);

  if (venues.isPending) {
    return (
      <View
        testID="create-session-loading"
        style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}
      >
        <SkeletonCard />
      </View>
    );
  }

  if (venues.isError || venues.data === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.lg }}>
        <ErrorState
          message={t('admin.error.venueNotFound')}
          onRetry={retry}
          isRetrying={venues.isFetching}
          testID="create-session-error"
        />
      </View>
    );
  }

  return (
    <CreateSessionFormView
      venues={venues.data}
      prefill={route.params ?? {}}
      onCreated={navigation.goBack}
    />
  );
};

interface FormViewProps {
  venues: VenueOption[];
  prefill: Prefill;
  onCreated: () => void;
}

const CreateSessionFormView: React.FC<FormViewProps> = ({ venues, prefill, onCreated }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const create = useCreateOneOffSession();

  // D1: there are two venues, and a required field with an obvious default
  // should carry it rather than open blank.
  const initialVenue = venues.find((venue) => venue.id === prefill.venueId) ?? venues[0];
  const initialDuration = prefill.durationMinutes ?? DEFAULT_DURATION;

  const [duration, setDuration] = useState<DurationMinutes>(initialDuration);
  const [venueId, setVenueId] = useState<string>(initialVenue?.id ?? '');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit, setValue } = useForm<CreateSessionForm>({
    resolver: zodResolver(createSessionSchema),
    // Validates once a field has been left, then on every keystroke — the same
    // mode the sign-up form uses (14.2). `onBlur` alone meant a coach who
    // corrected a rejected field had to leave it again to be told he had.
    mode: 'onTouched',
    defaultValues: {
      venueId: initialVenue?.id ?? '',
      sessionDate: prefill.sessionDate ?? ammanDayKey(nowInAmman()),
      startTime: prefill.startTime ?? DEFAULT_START_TIME,
      priceJD: prefill.priceJD ?? DEFAULT_PRICE_JD,
      courtCount: String(prefill.courtCount ?? initialVenue?.courtCount ?? PLAYERS_PER_COURT),
      rotationCount: String(defaultRotationCount(initialDuration)),
    },
  });

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === venueId),
    [venueId, venues],
  );

  const chooseVenue = useCallback(
    (id: string): void => {
      setVenueId(id);
      setValue('venueId', id, { shouldValidate: true });
      // D4: all the courts at a venue are rented for the whole night, so the
      // venue's own count is the right starting point.
      const venue = venues.find((candidate) => candidate.id === id);
      if (venue !== undefined) setValue('courtCount', String(venue.courtCount));
    },
    [setValue, venues],
  );

  const chooseDuration = useCallback(
    (minutes: DurationMinutes): void => {
      setDuration(minutes);
      // D5 ties the rotation count to the type. He can still override it.
      setValue('rotationCount', String(defaultRotationCount(minutes)));
    },
    [setValue],
  );

  // useWatch rather than the form's own `watch`: the latter returns a fresh
  // function on every render, which the React Compiler cannot memoize.
  const courtCount = Number(useWatch({ control, name: 'courtCount' }));
  const priceJD = useWatch({ control, name: 'priceJD' });
  const startTime = useWatch({ control, name: 'startTime' });
  const sessionDate = useWatch({ control, name: 'sessionDate' });

  // A server error like "another session already starts at this time in
  // this venue" only means anything for the exact venue/date/time it was
  // raised for. Without this, changing any of the three away from the
  // conflict still shows the same message, which reads as if the new
  // combination were the problem too. Adjusted during render (React's own
  // pattern for this — see "You Might Not Need an Effect") rather than in
  // an effect, so it takes hold the same frame the field changes.
  const conflictKey = `${venueId}|${sessionDate}|${startTime}`;
  const [lastConflictKey, setLastConflictKey] = useState(conflictKey);
  if (conflictKey !== lastConflictKey) {
    setLastConflictKey(conflictKey);
    setSubmitError(null);
  }

  const onSubmit = useCallback(
    (values: CreateSessionForm): void => {
      setSubmitError(null);
      create.mutate(
        {
          venueId: values.venueId,
          sessionDate: values.sessionDate,
          startTime: values.startTime,
          durationMinutes: duration,
          priceFils: fils(Number(values.priceJD)),
          courtCount: Number(values.courtCount),
          rotationCount: Number(values.rotationCount),
        },
        {
          onSuccess: onCreated,
          onError: (error) => setSubmitError(t(sessionErrorMessageKey(error))),
        },
      );
    },
    [create, duration, onCreated, t],
  );

  const capacity = Number.isFinite(courtCount) ? courtCount * PLAYERS_PER_COURT : 0;
  // Null while the field is empty or mid-typing. Rendered as 0 rather than as
  // a gap, because the summary is a sentence and a hole in it reads worse than
  // a price that has not been set yet.
  const priceFils = parseFils(priceJD);

  // Both fall back to the raw field value: it is only ever not parseable if
  // something put a value in the form that neither picker can produce, and a
  // summary is not the place to throw about it. The schema reports it.
  const summaryDate = DAY_KEY_PATTERN.test(sessionDate)
    ? formatSessionDate(ammanDayStart(sessionDate), theme.locale)
    : sessionDate;
  const summaryTime = CLOCK_PATTERN.test(startTime)
    ? formatClockTime(startTime, theme.locale)
    : startTime;

  return (
    <ScrollView
      testID="create-session"
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
    >
      <Card>
        <Text variant="heading">{t('admin.create.title')}</Text>
        <Text variant="caption" tone="tertiary">
          {t('admin.create.oneOffNote')}
        </Text>

        <SegmentedControl<string>
          label={t('admin.create.venue')}
          options={venues.map((venue) => ({
            value: venue.id,
            label: venue.name,
            caption: venue.area,
          }))}
          value={venueId}
          onChange={chooseVenue}
          testID="create-venue"
        />

        <FormDateField
          control={control}
          name="sessionDate"
          label={t('admin.create.date')}
          doneLabel={t('common.done')}
          testID="create-date"
        />

        <FormTimeField
          control={control}
          name="startTime"
          label={t('admin.edit.startTime')}
          doneLabel={t('common.done')}
          testID="create-start-time"
        />

        <SegmentedControl<DurationMinutes>
          label={t('admin.edit.duration')}
          options={DURATIONS.map((minutes) => ({
            value: minutes,
            label: t(minutes === 150 ? 'admin.edit.duration150' : 'admin.edit.duration90'),
          }))}
          value={duration}
          onChange={chooseDuration}
          testID="create-duration"
        />

        <FormNumericInput
          control={control}
          name="priceJD"
          label={t('admin.edit.price')}
          suffix={t('common.jd')}
          testID="create-price"
        />

        <FormField
          control={control}
          name="courtCount"
          label={t('admin.edit.courtCount')}
          keyboardType="number-pad"
          isLTR
          {...(selectedVenue === undefined
            ? {}
            : { hint: t('session.courtsValue', { count: selectedVenue.courtCount }) })}
          testID="create-court-count"
        />

        <FormField
          control={control}
          name="rotationCount"
          label={t('admin.create.rotationCount')}
          keyboardType="number-pad"
          isLTR
          testID="create-rotation-count"
        />

        <Text variant="small" tone="secondary" testID="create-summary">
          {t('admin.create.summary', {
            venue: selectedVenue?.name ?? '',
            // The summary reads back what the two pickers show, not the wire
            // format underneath them — a coach checking his own entry should
            // not have to recognise `2026-08-22` and `19:00` as the date and
            // time he just picked. 16.1.
            date: summaryDate,
            time: summaryTime,
            capacity,
            price: formatMoney(priceFils ?? fils(0), theme.locale),
          })}
        </Text>

        {submitError === null ? null : (
          <Text variant="small" tone="danger" testID="create-error">
            {submitError}
          </Text>
        )}

        <Button
          label={t('admin.create.submit')}
          onPress={handleSubmit(onSubmit)}
          isLoading={create.isPending}
          // Deliberately not disabled on `formState.isValid`, unlike 14.2's
          // sign up. A disabled button is a dead end on a seven-field form:
          // it says something is wrong and not what. Tapping it runs the
          // resolver over every field, which puts a message under each one
          // that needs it and submits nothing — the report the coach came for.
          isFullWidth
          testID="create-submit"
        />
      </Card>
    </ScrollView>
  );
};

export default CreateSessionScreen;
