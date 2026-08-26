/**
 * Announcement queries. Every Supabase read passes through here. CLAUDE.md.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { countPushDevices, fetchAnnouncement, fetchAnnouncements } from './api';
import type { Announcement } from './types';

export const announcementKeys = {
  all: ['announcements'] as const,
  list: ['announcements', 'list'] as const,
  detail: (id: string) => ['announcements', 'detail', id] as const,
  deviceCount: ['announcements', 'deviceCount'] as const,
};

/**
 * 14.11 and 15.11. The same list on both sides of the app, because 7.3 gives
 * both the same rows.
 *
 * Refetched on focus, which is how a player who was told about an announcement
 * finds it there when he opens the tab.
 */
export function useAnnouncements(): UseQueryResult<Announcement[], Error> {
  return useQuery({
    queryKey: announcementKeys.list,
    queryFn: fetchAnnouncements,
    staleTime: 30 * 1000,
  });
}

/** 14.11's detail view, and section 18's deep link destination. */
export function useAnnouncement(id: string): UseQueryResult<Announcement | null, Error> {
  return useQuery({
    queryKey: announcementKeys.detail(id),
    queryFn: () => fetchAnnouncement(id),
  });
}

/**
 * 15.11's confirmation dialog: "how many devices will receive it".
 *
 * Not cached for long. The number is the one thing in that dialog the coach is
 * being asked to weigh, and a stale count would be a claim about how far his
 * message is about to travel.
 */
export function usePushDeviceCount(enabled: boolean): UseQueryResult<number, Error> {
  return useQuery({
    queryKey: announcementKeys.deviceCount,
    queryFn: countPushDevices,
    enabled,
    staleTime: 0,
    gcTime: 60 * 1000,
  });
}
