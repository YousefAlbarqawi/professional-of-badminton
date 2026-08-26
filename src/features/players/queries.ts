/**
 * Profile queries. Every Supabase read the app makes about a player passes
 * through here. CLAUDE.md.
 */
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';

import { fetchMyProfile, fetchPlayerPage, type PlayerDirectoryPage } from './api';
import type { DirectoryPlayer, MyProfile, PlayerFilters } from './types';

export const profileKeys = {
  all: ['profiles'] as const,
  me: (userId: string) => ['profiles', 'me', userId] as const,
};

/**
 * 15.7's directory. A separate key space from `profileKeys`, because a credit
 * adjustment changes a row here and changes nothing about anybody's own
 * profile — see `features/subscriptions/mutations.ts`.
 */
export const playerKeys = {
  all: ['players'] as const,
  directory: (filters: PlayerFilters) => ['players', 'directory', filters] as const,
};

/**
 * The signed-in player's own profile. RootNavigator reads the role from it to
 * choose a navigator, so it is the one query the app waits on before showing
 * anything past sign-in.
 */
export function useMyProfile(): UseQueryResult<MyProfile, Error> {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: userId === undefined ? profileKeys.all : profileKeys.me(userId),
    queryFn: async () => {
      if (userId === undefined) throw new Error('not_authenticated');
      return fetchMyProfile(userId);
    },
    enabled: userId !== undefined,
    // A role change by the coach should take effect on the player's phone the
    // next time he opens the app, not eventually.
    staleTime: 60_000,
  });
}

/**
 * 15.7. Searchable, filterable, sortable — all of it server side, and paged:
 * OPEN-ITEMS.md recorded the directory as unpaged while one page held the
 * whole roster, with `search_players`' cursor (migration 0041) named as the
 * way to close it once it didn't. `PlayerListScreen` walks pages forward with
 * `fetchNextPage` on `onEndReached`; nothing here decides when that happens.
 *
 * The query is debounced by the screen rather than here, per 17.4's rule about
 * a spinner and the fact that the coach types a name a letter at a time. The
 * previous pages stay on screen while the next one loads, because a list that
 * empties between keystrokes is harder to read than one that lags.
 */
export function usePlayerDirectory(
  filters: PlayerFilters,
): UseInfiniteQueryResult<InfiniteData<PlayerDirectoryPage>, Error> {
  return useInfiniteQuery({
    queryKey: playerKeys.directory(filters),
    queryFn: ({ pageParam }) => fetchPlayerPage(filters, pageParam),
    initialPageParam: null as DirectoryPlayer | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: (previous) => previous,
  });
}
