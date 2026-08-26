/**
 * Booking queries. Every Supabase read about a booking passes through here.
 * CLAUDE.md.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type { Locale } from '@/lib/money';
import { nowInAmman } from '@/lib/time';

import {
  fetchCoachOptions,
  fetchMyBookingIdOnSession,
  fetchIsOnWaitlist,
  fetchMyBooking,
  fetchMyBookedSessionIds,
  fetchMyBookings,
  fetchSessionRoster,
  searchPlayers,
} from './api';
import { splitBookings } from './bookingState';
import { isSearchable } from './schemas';
import type {
  BookingSegments,
  CoachOption,
  MyBooking,
  PlayerSearchResult,
  RosterEntry,
} from './types';

export const bookingKeys = {
  all: ['bookings'] as const,
  mine: (playerId: string) => ['bookings', 'mine', playerId] as const,
  inRange: (playerId: string, from: string, to: string) =>
    ['bookings', 'mine', playerId, { from, to }] as const,
  onSession: (playerId: string, sessionId: string) =>
    ['bookings', 'mine', playerId, 'session', sessionId] as const,
  waitlistOnSession: (playerId: string, sessionId: string) =>
    ['waitlist', 'mine', playerId, 'session', sessionId] as const,
  list: (playerId: string, locale: Locale) => ['bookings', 'list', playerId, locale] as const,
  detail: (bookingId: string, locale: Locale) => ['bookings', 'detail', bookingId, locale] as const,
  roster: (sessionId: string) => ['bookings', 'roster', sessionId] as const,
  playerSearch: (sessionId: string, query: string) =>
    ['bookings', 'playerSearch', sessionId, query] as const,
  coachOptions: (sessionId: string) => ['bookings', 'coachOptions', sessionId] as const,
};

function useLocale(): Locale {
  const { i18n } = useTranslation();
  return i18n.language === 'ar' ? 'ar' : 'en';
}

/** The booked chip on the schedule. 14.6. */
export function useMyBookedSessionIds(range: {
  from: string;
  to: string;
}): UseQueryResult<Set<string>, Error> {
  const { user } = useAuth();
  const playerId = user?.id;

  return useQuery({
    queryKey:
      playerId === undefined
        ? bookingKeys.all
        : bookingKeys.inRange(playerId, range.from, range.to),
    queryFn: async () => {
      if (playerId === undefined) throw new Error('not_authenticated');
      return fetchMyBookedSessionIds(playerId, range);
    },
    enabled: playerId !== undefined,
  });
}

export interface MySessionStanding {
  isBooked: boolean;
  /** Null unless he holds a confirmed booking. What *Cancel* acts on. */
  bookingId: string | null;
  isOnWaitlist: boolean;
}

/**
 * Where the player stands on one session: booked, waiting, or neither. Both
 * halves feed 14.7's action table, so they are fetched together and share a
 * loading state — a detail screen that knew one but not the other would flash
 * the wrong button.
 */
export function useMySessionStanding(sessionId: string): UseQueryResult<MySessionStanding, Error> {
  const { user } = useAuth();
  const playerId = user?.id;

  return useQuery({
    queryKey: playerId === undefined ? bookingKeys.all : bookingKeys.onSession(playerId, sessionId),
    queryFn: async () => {
      if (playerId === undefined) throw new Error('not_authenticated');
      const [bookingId, isOnWaitlist] = await Promise.all([
        fetchMyBookingIdOnSession(playerId, sessionId),
        fetchIsOnWaitlist(playerId, sessionId),
      ]);
      return { isBooked: bookingId !== null, bookingId, isOnWaitlist };
    },
    enabled: playerId !== undefined,
  });
}

/**
 * 14.9. Every booking the player holds, already split into the two segments.
 *
 * The split is redone on every render rather than cached, because it depends
 * on the clock: a session that was upcoming when the query resolved becomes
 * past while the screen is open, and the segment it sits in should follow.
 */
export function useMyBookings(): UseQueryResult<MyBooking[], Error> & {
  segments: BookingSegments;
} {
  const { user } = useAuth();
  const locale = useLocale();
  const playerId = user?.id;

  const query = useQuery({
    queryKey: playerId === undefined ? bookingKeys.all : bookingKeys.list(playerId, locale),
    queryFn: async () => {
      if (playerId === undefined) throw new Error('not_authenticated');
      return fetchMyBookings(playerId, locale);
    },
    enabled: playerId !== undefined,
  });

  const segments = useMemo(() => splitBookings(query.data ?? [], nowInAmman()), [query.data]);

  return { ...query, segments };
}

/** 14.10. One booking, everything about it the player may see. */
export function useMyBooking(bookingId: string): UseQueryResult<MyBooking, Error> {
  const locale = useLocale();

  return useQuery({
    queryKey: bookingKeys.detail(bookingId, locale),
    queryFn: () => fetchMyBooking(bookingId, locale),
  });
}

/** 15.2's players tab. Staff only, and RLS is what makes that true. */
export function useSessionRoster(sessionId: string): UseQueryResult<RosterEntry[], Error> {
  return useQuery({
    queryKey: bookingKeys.roster(sessionId),
    queryFn: () => fetchSessionRoster(sessionId),
  });
}

/**
 * 15.2's "Add player" search.
 *
 * `query` is already debounced by the caller — the field types faster than the
 * network answers, and 15.2's minimum of two characters is a floor rather than
 * a rate limit. `keepPreviousData` stops the list blanking between keystrokes,
 * which at 300ms is otherwise a visible flicker.
 */
export function usePlayerSearch(
  sessionId: string,
  query: string,
): UseQueryResult<PlayerSearchResult[], Error> {
  const trimmed = query.trim();

  return useQuery({
    queryKey: bookingKeys.playerSearch(sessionId, trimmed),
    queryFn: () => searchPlayers(trimmed, sessionId),
    enabled: isSearchable(trimmed),
    placeholderData: keepPreviousData,
  });
}

/** 15.2's "Add coach" picker, with D76's already-tonight warning. */
export function useCoachOptions(
  sessionId: string,
  isEnabled: boolean,
): UseQueryResult<CoachOption[], Error> {
  return useQuery({
    queryKey: bookingKeys.coachOptions(sessionId),
    queryFn: () => fetchCoachOptions(sessionId),
    enabled: isEnabled,
  });
}
