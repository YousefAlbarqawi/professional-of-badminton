/**
 * Session queries. Every Supabase read about a session passes through here.
 * CLAUDE.md.
 *
 * 14.6 asks the player schedule to "auto refetch on focus and every 60 seconds
 * while the screen is in the foreground". `refetchInterval` is paired with
 * `refetchIntervalInBackground: false`, and the focus manager is wired to
 * AppState in src/lib/queryClient.ts, so a backgrounded app stops polling.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { useMyBookedSessionIds } from '@/features/bookings/queries';
import type { Locale } from '@/lib/money';
import { ammanDayKey, bookingWindowEnd, nowInAmman } from '@/lib/time';
import { addDays } from 'date-fns';

import {
  fetchMyBookingProfile,
  fetchSession,
  fetchSessionAttendees,
  fetchSessionsInRange,
  fetchVenues,
  type DateRange,
} from './api';
import { resolvePrice } from './pricing';
import { groupByAmmanDay, isVisibleOnPlayerSchedule } from './sessionState';
import type {
  Attendee,
  MyBookingProfile,
  PlayerSession,
  Session,
  SessionDay,
  VenueOption,
} from './types';

/** 14.6: refetch every 60 seconds while the schedule is in the foreground. */
const SCHEDULE_POLL_MS = 60_000;

/** 15.3: the admin schedule is a calendar-ish list, 30 days forward. */
export const ADMIN_SCHEDULE_DAYS = 30;

export const sessionKeys = {
  all: ['sessions'] as const,
  range: (from: string, to: string, locale: Locale) =>
    ['sessions', 'range', { from, to, locale }] as const,
  detail: (sessionId: string, locale: Locale) => ['sessions', 'detail', sessionId, locale] as const,
  attendees: (sessionId: string) => ['sessions', 'attendees', sessionId] as const,
  bookingProfile: (userId: string) => ['sessions', 'bookingProfile', userId] as const,
  venues: (locale: Locale) => ['venues', locale] as const,
};

function useLocale(): Locale {
  const { i18n } = useTranslation();
  return i18n.language === 'ar' ? 'ar' : 'en';
}

/** The 5 day window, as `yyyy-MM-dd` bounds. 5.2. */
export function playerWindowRange(now: Date): DateRange {
  return { from: ammanDayKey(now), to: ammanDayKey(bookingWindowEnd(now)) };
}

function useSessionsInRange(range: DateRange, pollMs?: number): UseQueryResult<Session[], Error> {
  const locale = useLocale();

  return useQuery({
    queryKey: sessionKeys.range(range.from, range.to, locale),
    queryFn: () => fetchSessionsInRange(range, locale),
    ...(pollMs === undefined
      ? {}
      : { refetchInterval: pollMs, refetchIntervalInBackground: false }),
    refetchOnWindowFocus: true,
  });
}

/**
 * The player's visibility level and custom rates.
 *
 * Long stale time on purpose: both change only when the coach changes them,
 * and neither is ever shown, so a stale copy costs the player nothing worse
 * than seeing the list price for a minute.
 */
export function useMyBookingProfile(): UseQueryResult<MyBookingProfile, Error> {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: userId === undefined ? sessionKeys.all : sessionKeys.bookingProfile(userId),
    queryFn: async () => {
      if (userId === undefined) throw new Error('not_authenticated');
      return fetchMyBookingProfile(userId);
    },
    enabled: userId !== undefined,
    staleTime: 5 * 60_000,
  });
}

export interface PlayerScheduleResult {
  days: SessionDay<PlayerSession>[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * The player's schedule: exactly 5 days including today, grouped, with
 * occupancy, the booked chip and his own rate.
 *
 * Generation runs 21 days ahead (8.1) and RLS caps what he can read at 5 days
 * (7.3). Both numbers are deliberate and they are not the same number.
 */
export function usePlayerSchedule(): PlayerScheduleResult {
  const now = useMemo(() => nowInAmman(), []);
  const range = useMemo(() => playerWindowRange(now), [now]);

  const sessions = useSessionsInRange(range, SCHEDULE_POLL_MS);
  const booked = useMyBookedSessionIds(range);
  const profile = useMyBookingProfile();

  const days = useMemo<SessionDay<PlayerSession>[]>(() => {
    if (sessions.data === undefined) return [];

    const visible = sessions.data.filter((session) =>
      isVisibleOnPlayerSchedule(session, nowInAmman()),
    );

    return groupByAmmanDay(
      visible.map((session) => toPlayerSession(session, profile.data, booked.data)),
    );
  }, [booked.data, profile.data, sessions.data]);

  return {
    days,
    // The booked chip and the rate are decoration on a list that is useful
    // without them, so neither holds the schedule back. The sessions query is
    // the one worth waiting for.
    isPending: sessions.isPending,
    isError: sessions.isError,
    isFetching: sessions.isFetching || booked.isFetching,
    error: sessions.error,
    refetch: () => {
      void sessions.refetch();
      void booked.refetch();
    },
  };
}

function toPlayerSession(
  session: Session,
  profile: MyBookingProfile | undefined,
  booked: Set<string> | undefined,
): PlayerSession {
  const { payableFils, hasCustomRate } = resolvePrice(
    profile,
    session.sessionType,
    session.priceFils,
  );

  return {
    ...session,
    payableFils,
    hasCustomRate,
    isBooked: booked?.has(session.id) ?? false,
    // The schedule never renders a waitlist state; session detail fetches it
    // per session, where one round trip buys something.
    isOnWaitlist: false,
  };
}

/** One session, for the detail screen. */
export function useSession(sessionId: string): UseQueryResult<Session, Error> {
  const locale = useLocale();

  return useQuery({
    queryKey: sessionKeys.detail(sessionId, locale),
    queryFn: () => fetchSession(sessionId, locale),
  });
}

/**
 * The attendee list. What comes back is decided by the server from the
 * caller's visibility level; the screen only chooses how to draw it. 7.2.
 */
export function useSessionAttendees(sessionId: string): UseQueryResult<Attendee[], Error> {
  return useQuery({
    queryKey: sessionKeys.attendees(sessionId),
    queryFn: () => fetchSessionAttendees(sessionId),
  });
}

/** 15.3: 30 days forward, cancelled sessions included. */
export function useAdminSchedule(): UseQueryResult<Session[], Error> {
  const now = useMemo(() => nowInAmman(), []);
  const range = useMemo<DateRange>(
    () => ({
      from: ammanDayKey(now),
      to: ammanDayKey(addDays(now, ADMIN_SCHEDULE_DAYS - 1)),
    }),
    [now],
  );

  return useSessionsInRange(range);
}

/** 15.1: today's sessions, then tomorrow's. */
export function useTodaySessions(): UseQueryResult<Session[], Error> {
  const now = useMemo(() => nowInAmman(), []);
  const range = useMemo<DateRange>(
    () => ({ from: ammanDayKey(now), to: ammanDayKey(addDays(now, 1)) }),
    [now],
  );

  return useSessionsInRange(range, SCHEDULE_POLL_MS);
}

export function useVenues(): UseQueryResult<VenueOption[], Error> {
  const locale = useLocale();

  return useQuery({
    queryKey: sessionKeys.venues(locale),
    queryFn: () => fetchVenues(locale),
    // Two rows that change when the academy moves premises.
    staleTime: 30 * 60_000,
  });
}
